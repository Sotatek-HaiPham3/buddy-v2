export const detectImageBboxPrompt = (): string => `You are inspecting a page rendered from a PDF.

List every visual element on the page that is not plain body text or a plain table.
Include charts, diagrams, photos, illustrations, maps, logos, and infographics.

Return JSON only:
{
  "visual_elements": [
    {
      "type": "chart|diagram|photo|illustration|map|logo|infographic|other",
      "bbox": { "top": 0, "left": 0, "width": 0, "height": 0 },
      "hint": "short description"
    }
  ]
}

Use percentages in [0,100] with a top-left origin.
If there are no visual elements, return {"visual_elements":[]}.`;
