/**
 * AI Detection utilities for analyzing images using the backend ML service.
 */

import * as FileSystem from 'expo-file-system/legacy';

const API_BASE_URL = 'http://13.204.69.94:5000';

export type AIDetectionResult = {
  model_id: string;
  model_version: string;
  model_hash?: string;
  score: number;
  label: string;
  explanation_ref?: string;
  processed_at?: string;
};

export type AIDetectionResponse = {
  success: boolean;
  detection?: AIDetectionResult;
  error?: string;
};

/**
 * Call the backend AI detection API to analyze an image.
 * 
 * @param imageUri - Local file URI of the image to analyze
 * @returns Detection result with AI score and metadata
 * @throws Error if the API call fails or returns an error
 */
export async function detectAIImage(imageUri: string): Promise<AIDetectionResult> {
  if (!imageUri || typeof imageUri !== 'string') {
    throw new Error('detectAIImage: imageUri must be a non-empty string');
  }

  try {
    // Read image file as base64
    const base64Image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Determine image type from URI
    const imageType = imageUri.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';

    // Call backend AI detection API
    const response = await fetch(`${API_BASE_URL}/api/detect-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
        image_type: imageType,
      }),
    });
    console.log('AI detection API response status:', response.status);

    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || `HTTP ${response.status}`;
      } catch {
        errorMessage = `HTTP ${response.status} ${response.statusText}`;
      }
      console.error('AI detection API error:', errorMessage);
      throw new Error(`AI detection failed: ${errorMessage}`);
    }

    const data: AIDetectionResponse = await response.json();

    if (!data.success || !data.detection) {
      throw new Error(data.error || 'AI detection returned no result');
    }

    return data.detection;
  } catch (err: any) {
    console.error('detectAIImage error:', err);
    const message = err?.message || String(err);
    throw new Error(`AI detection failed: ${message}`);
  }
}

/**
 * Get a human-readable label for the AI detection score.
 * 
 * @param score - Detection score (0-1, where higher means more likely AI-generated)
 * @returns Human-readable label
 */
export function getDetectionLabel(score: number): string {
  if (score >= 0.8) return 'Likely AI-Generated';
  if (score >= 0.5) return 'Possibly AI-Generated';
  if (score >= 0.2) return 'Possibly Authentic';
  return 'Likely Authentic';
}

/**
 * Get a color code for the detection score (for UI display).
 * 
 * @param score - Detection score (0-1)
 * @returns Color hex code
 */
export function getDetectionColor(score: number): string {
  if (score >= 0.8) return '#ef4444'; // red
  if (score >= 0.5) return '#f97316'; // orange
  if (score >= 0.2) return '#eab308'; // yellow
  return '#22c55e'; // green
}