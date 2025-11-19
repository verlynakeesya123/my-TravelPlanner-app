import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;
  private readonly MODEL_NAME = 'gemini-2.5-flash';

  constructor() {
    if (!process.env.API_KEY) {
      console.error('API_KEY environment variable is not set. Gemini API calls will fail.');
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async generateContent(prompt: string, responseSchema: any): Promise<any> {
    const response = await this.ai.models.generateContent({
      model: this.MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        // Removed maxOutputTokens to prevent premature JSON truncation.
        // The model can use its full context window for detailed responses.
      },
    });
    return response;
  }
}