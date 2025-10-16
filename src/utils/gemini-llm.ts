/**
 * LLM Integration for TrainingRecords
 *
 * Handles the AI recommendation functionality using Google's Gemini API.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Configuration for API access
 */
export interface Config {
  apiKey: string;
}

export class GeminiLLM {
  private apiKey: string;

  constructor(config: Config) {
    this.apiKey = config.apiKey;
  }

  async executeLLM(prompt: string): Promise<string> {
    try {
      // Initialize Gemini AI
      const genAI = new GoogleGenerativeAI(this.apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
        generationConfig: {
          maxOutputTokens: 500, // Shorter recommendations
          temperature: 0.7, // Balanced creativity vs consistency
        },
      });

      // Execute the LLM
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text.trim();
    } catch (error) {
      console.error("❌ Error calling Gemini API:", (error as Error).message);
      throw error;
    }
  }
}
