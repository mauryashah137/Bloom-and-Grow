"""
Vision Service — Real multimodal plant/product identification using Gemini.
Accepts images or sampled video frames, returns structured candidates
with confidence scores, catalog matches, and follow-up questions.
"""
import base64, json, logging, os
from typing import Optional

logger = logging.getLogger(__name__)

GCP_PROJECT = os.environ.get("GCP_PROJECT", "")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")


class VisionService:
    def __init__(self, catalog_service=None):
        self._catalog = catalog_service
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(
                    vertexai=True, project=GCP_PROJECT, location=GCP_LOCATION
                )
            except Exception as e:
                logger.error(f"Failed to init Gemini client for vision: {e}")
        return self._client

    async def identify(
        self,
        image_b64: str,
        mime_type: str = "image/jpeg",
        context: str = "",
        customer_preferences: dict = None,
    ) -> dict:
        """
        Identify a plant, product, or item from an image.
        Returns structured candidates with confidence, catalog matches, and next question.
        """
        client = self._get_client()
        if not client:
            return self._fallback_identification(context)

        try:
            from google.genai import types

            prompt = self._build_vision_prompt(context, customer_preferences)
            image_bytes = base64.b64decode(image_b64)

            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Content(role="user", parts=[
                        types.Part(inline_data=types.Blob(
                            data=image_bytes, mime_type=mime_type
                        )),
                        types.Part(text=prompt),
                    ])
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.3,
                ),
            )

            raw = response.text.strip()
            # Parse the JSON response
            result = json.loads(raw)
            # Validate and normalize
            result = self._normalize_result(result)

            # Resolve candidates to catalog items
            if self._catalog:
                catalog_matches = []
                for candidate in result.get("candidates", []):
                    name = candidate.get("name", "")
                    category = candidate.get("category", "")
                    query = f"{name} {category}".strip()
                    matches = await self._catalog.search(query=query, limit=3)
                    for m in matches:
                        if m["id"] not in [cm["id"] for cm in catalog_matches]:
                            catalog_matches.append(m)
                result["catalog_matches"] = catalog_matches[:5]

            return result

        except json.JSONDecodeError as e:
            logger.warning(f"Vision response not valid JSON: {e}")
            return self._fallback_identification(context)
        except Exception as e:
            logger.error(f"Vision identification failed: {e}")
            return self._fallback_identification(context)

    def _build_vision_prompt(self, context: str, preferences: dict = None) -> str:
        pref_text = ""
        if preferences:
            pref_text = f"""
Customer preferences:
- Skill level: {preferences.get('skill_level', 'unknown')}
- Garden type: {preferences.get('garden_type', 'unknown')}
- Budget range: {preferences.get('budget_range', 'unknown')}
"""
        return f"""Analyze this image and identify what is shown. This is for a garden and home retail store.

{f'Customer said: "{context}"' if context else ''}
{pref_text}

Return a JSON object with this exact structure:
{{
    "candidates": [
        {{
            "name": "Common name of the plant/product",
            "scientific_name": "Scientific name if applicable",
            "confidence": 0.0 to 1.0,
            "category": "houseplant|outdoor_plant|succulent|tool|soil|pot|fertilizer|pest_control|decor|other",
            "description": "Brief description of what was identified"
        }}
    ],
    "health_assessment": {{
        "status": "healthy|minor_issues|needs_attention|critical",
        "observations": ["list of observations about condition"],
        "recommendations": ["list of care recommendations"]
    }},
    "issue_detected": "none|overwatering|underwatering|pest_infestation|nutrient_deficiency|sunburn|root_rot|damage|other",
    "next_question": "A helpful follow-up question to ask the customer to better assist them",
    "care_tips": ["list of relevant care tips"]
}}

Be specific and accurate. If uncertain, lower the confidence score. Always provide a helpful next_question."""

    def _normalize_result(self, result: dict) -> dict:
        """Ensure all expected fields are present."""
        if "candidates" not in result:
            result["candidates"] = []
        for c in result["candidates"]:
            c.setdefault("confidence", 0.5)
            c.setdefault("category", "other")
            c.setdefault("description", "")
            c.setdefault("scientific_name", "")
        result.setdefault("health_assessment", {
            "status": "healthy",
            "observations": [],
            "recommendations": [],
        })
        result.setdefault("issue_detected", "none")
        result.setdefault("next_question", "Would you like product recommendations for this?")
        result.setdefault("care_tips", [])
        result.setdefault("catalog_matches", [])
        return result

    def _fallback_identification(self, context: str) -> dict:
        """Fallback when Gemini vision is unavailable — uses context clues."""
        # Try to infer from context
        context_lower = (context or "").lower()
        candidates = []

        plant_hints = {
            "monstera": ("Monstera Deliciosa", "houseplant", 0.7),
            "fiddle": ("Fiddle Leaf Fig", "houseplant", 0.7),
            "pothos": ("Pothos", "houseplant", 0.7),
            "snake plant": ("Snake Plant", "houseplant", 0.7),
            "succulent": ("Succulent", "succulent", 0.6),
            "cactus": ("Cactus", "succulent", 0.6),
            "fern": ("Fern", "houseplant", 0.6),
            "orchid": ("Orchid", "houseplant", 0.6),
            "peace lily": ("Peace Lily", "houseplant", 0.7),
        }

        for hint, (name, cat, conf) in plant_hints.items():
            if hint in context_lower:
                candidates.append({
                    "name": name,
                    "scientific_name": "",
                    "confidence": conf,
                    "category": cat,
                    "description": f"Identified from context: {hint}",
                })

        if not candidates:
            candidates.append({
                "name": "Unidentified Plant",
                "scientific_name": "",
                "confidence": 0.3,
                "category": "houseplant",
                "description": "Could not identify with high confidence. Please try a clearer image or describe what you see.",
            })

        return {
            "candidates": candidates,
            "health_assessment": {
                "status": "healthy",
                "observations": ["Visual analysis limited — using context clues"],
                "recommendations": ["Try uploading a clearer, well-lit photo for better identification"],
            },
            "issue_detected": "none",
            "next_question": "Could you describe the plant in more detail, or show me a closer photo?",
            "care_tips": [],
            "catalog_matches": [],
            "fallback": True,
        }
