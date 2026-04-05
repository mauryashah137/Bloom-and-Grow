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
                model="gemini-2.0-flash",  # Faster model for vision
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
        ctx = f'Customer said: "{context}"' if context else ''
        return f"""Identify the plant or garden product in this image for a garden store.
{ctx}

Focus on plants/flowers/garden items. Ignore people/furniture unless NO garden item is visible.
If no plant visible, set category to "not_garden_related".

Return compact JSON:
{{"candidates":[{{"name":"common name","confidence":0.0-1.0,"category":"houseplant|flowering|succulent|tool|soil|pot|not_garden_related","description":"brief"}}],"health_assessment":{{"status":"healthy|needs_attention|damaged","observations":[],"recommendations":[]}},"issue_detected":"none|pest_infestation|overwatering|other","ideal_soil_type":"well-draining|moisture-retaining|general-purpose","ideal_fertilizer":"balanced|flowering|foliage","next_question":"helpful follow-up","care_tips":[]}}"""

    def _normalize_result(self, result: dict) -> dict:
        """Ensure all expected fields are present."""
        if "candidates" not in result:
            result["candidates"] = []
        for c in result["candidates"]:
            c.setdefault("confidence", 0.5)
            c.setdefault("category", "other")
            c.setdefault("description", "")
            c.setdefault("scientific_name", "")
            c.setdefault("is_damaged", False)
            c.setdefault("damage_description", "")
        result.setdefault("health_assessment", {
            "status": "healthy",
            "observations": [],
            "recommendations": [],
        })
        result.setdefault("issue_detected", "none")
        result.setdefault("image_quality", "good")
        result.setdefault("multiple_items", False)
        result.setdefault("ideal_soil_type", "general-purpose")
        result.setdefault("ideal_fertilizer", "balanced")
        result.setdefault("light_needs", "bright-indirect")
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
