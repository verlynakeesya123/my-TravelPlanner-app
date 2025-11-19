import { Component, signal, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService } from './services/gemini.service';
import { GoogleGenAI, Type } from '@google/genai';

interface Activity {
  name: string;
  time: string;
  cost: string; // e.g., "50000 IDR"
  actualCost: number | null; // User input for actual cost
  checkPriceLink: string;
}

interface DailyPlan {
  day: number;
  theme: string;
  activities: Activity[];
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private geminiService = inject(GeminiService);

  destination = signal<string>('');
  duration = signal<number | null>(null);
  interests = signal<string>('');
  totalBudgetInput = signal<string>(''); // For user input string
  totalBudget = signal<number | null>(null); // Parsed number for calculations

  itinerary = signal<DailyPlan[] | null>(null);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Budget Summary signals
  totalEstimatedCost = signal<number>(0);
  totalActualCost = signal<number>(0);
  averageDailyBudgetRemaining = signal<number | null>(null);

  itinerarySchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        day: { type: Type.NUMBER, description: 'Day number of the itinerary.' },
        theme: { type: Type.STRING, description: 'Brief theme or focus for the day.' },
        activities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Name of the place or activity.' },
              time: { type: Type.STRING, description: 'Opening/closing hours or duration (e.g., "09:00 - 17:00").' },
              cost: { type: Type.STRING, description: 'Estimated cost in local currency (e.g., "50000 IDR").' },
              checkPriceLink: { type: Type.STRING, description: 'Placeholder URL to check prices (e.g., "https://example.com/kinkakuji").' },
            },
            propertyOrdering: ["name", "time", "cost", "checkPriceLink"]
          },
        },
      },
      propertyOrdering: ["day", "theme", "activities"],
    },
  };

  private parseCurrency(currencyString: string): { amount: number, currencyCode: string } {
    if (!currencyString) return { amount: 0, currencyCode: 'IDR' }; // Default to IDR

    // Try to extract currency code (e.g., IDR, JPY)
    const currencyCodeMatch = currencyString.match(/[A-Z]{2,3}/i);
    const currencyCode = currencyCodeMatch ? currencyCodeMatch[0].toUpperCase() : 'IDR';

    // Remove non-numeric characters except for comma/dot that might be decimal separators
    const cleanedString = currencyString.replace(/[^\d,\.]/g, '');
    // Replace comma with dot for consistent parsing (e.g., "100.000,00" -> "100000.00")
    const normalizedString = cleanedString.replace(/\./g, '').replace(/,/g, '.');
    const amount = parseFloat(normalizedString) || 0;

    return { amount, currencyCode };
  }

  formatCurrency(amount: number | null, currencyCode: string = 'IDR'): string {
    if (amount === null || isNaN(amount)) return 'N/A';
    try {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch (e) {
      console.warn(`Could not format currency for amount ${amount} with code ${currencyCode}:`, e);
      return `${amount} ${currencyCode}`;
    }
  }

  onTotalBudgetInputChange(): void {
    const parsed = this.parseCurrency(this.totalBudgetInput());
    this.totalBudget.set(parsed.amount);
    this.calculateSummary();
  }

  calculateSummary(): void {
    let totalEst = 0;
    let totalAct = 0;
    // Removed `mainCurrencyCode` as it's not directly used for formatting in `calculateSummary`
    // and `formatCurrency` handles currency code per display.

    const currentItinerary = this.itinerary();
    if (currentItinerary) {
      for (const dayPlan of currentItinerary) {
        for (const activity of dayPlan.activities) {
          const { amount: estAmount } = this.parseCurrency(activity.cost);
          totalEst += estAmount;
          // No need to set `mainCurrencyCode` here, as it's handled by `formatCurrency` later.

          if (activity.actualCost !== null && !isNaN(activity.actualCost)) {
            totalAct += activity.actualCost;
          }
        }
      }
    }

    this.totalEstimatedCost.set(totalEst);
    this.totalActualCost.set(totalAct);

    const budget = this.totalBudget();
    const durationDays = this.duration();

    if (budget !== null && durationDays !== null && durationDays > 0) {
      const remainingBudget = budget - totalAct;
      const avgDailyRemaining = remainingBudget / durationDays;
      this.averageDailyBudgetRemaining.set(avgDailyRemaining);
    } else {
      this.averageDailyBudgetRemaining.set(null);
    }
  }

  async generateItinerary(): Promise<void> {
    if (!this.destination() || !this.duration()) {
      this.error.set('Harap isi Tujuan Wisata dan Durasi (Hari).');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.itinerary.set(null);
    this.totalEstimatedCost.set(0);
    this.totalActualCost.set(0);
    this.averageDailyBudgetRemaining.set(null);

    const prompt = `Buatkan itinerary perjalanan harian lengkap dalam bahasa Indonesia untuk destinasi "${this.destination()}" selama ${this.duration()} hari, dengan fokus pada "${this.interests()}". Sertakan nama tempat/aktivitas, jam buka/tutup (atau perkiraan waktu), estimasi biaya dalam mata uang lokal (sertakan kode mata uang seperti 'IDR' atau 'JPY'), dan link placeholder untuk cek harga untuk setiap aktivitas. Format output harus JSON sesuai skema yang diberikan.`;

    try {
      const response = await this.geminiService.generateContent(
        prompt,
        this.itinerarySchema
      );

      const jsonStr = response.text.trim();
      const parsedItinerary = JSON.parse(jsonStr) as DailyPlan[];

      // Initialize actualCost for each activity
      const initializedItinerary = parsedItinerary.map(dayPlan => ({
        ...dayPlan,
        activities: dayPlan.activities.map(activity => ({
          ...activity,
          actualCost: null, // Initialize actualCost to null
        }))
      }));
      this.itinerary.set(initializedItinerary);
      this.calculateSummary(); // Calculate initial summary

    } catch (e: any) {
      console.error('Error generating itinerary:', e);
      if (e instanceof SyntaxError && e.message.includes('JSON')) {
        this.error.set(`Gagal memproses itinerary: Model mungkin mengembalikan format yang tidak lengkap atau tidak valid. Coba lagi atau sesuaikan prompt Anda.`);
      } else {
        this.error.set(`Gagal membuat itinerary: ${e.message || 'Terjadi kesalahan tidak terduga.'}`);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  openGoogleSearch(query: string): void {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(searchUrl, '_blank');
  }
}