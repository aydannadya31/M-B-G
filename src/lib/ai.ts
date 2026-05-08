import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export async function processImageEdits(
  imageContent: string, // base64
  prompt: string,
  maskContent?: string // optional base64 mask
) {
  if (!ai) throw new Error("AI not initialized");

  const model = "gemini-2.5-flash-image";
  
  const promptText = maskContent 
    ? `${prompt}\n\nPlease apply this edit strictly to the area defined by the accompanying mask. Return the final edited image.`
    : `${prompt}\n\nPlease edit the provided image according to these instructions. Return the final edited image.`;

  const parts = [
    {
      inlineData: {
        data: imageContent.split(",")[1] || imageContent,
        mimeType: "image/png",
      },
    },
    ...(maskContent ? [{
      inlineData: {
        data: maskContent.split(",")[1] || maskContent,
        mimeType: "image/png",
      },
    }] : []),
    { text: promptText },
  ];

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts }
    });

    const candidateParts = response.candidates?.[0]?.content.parts || [];
    
    for (const part of candidateParts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    
    // Fallback if the AI returns text instead of an image
    const text = response.text;
    if (text) {
      console.warn("AI returned text instead of image:", text);
      return null;
    }
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
}

export async function getGeneralAIResponse(prompt: string, imageContext?: string) {
  if (!ai) return null;
  const model = "gemini-3-flash-preview";
  
  const contents = imageContext ? {
    parts: [
      { inlineData: { data: imageContext.split(",")[1], mimeType: "image/png" } },
      { text: prompt }
    ]
  } : prompt;

  const response = await ai.models.generateContent({
    model,
    contents
  });
  
  return response.text;
}
