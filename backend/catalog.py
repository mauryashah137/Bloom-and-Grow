"""
Product catalog for GreenLeaf Garden & Home.
In production: connect to Shopify / Firestore / AlloyDB.
"""
import asyncio, logging
logger = logging.getLogger(__name__)

PRODUCTS = [
    {"id":"P001","name":"Monstera Deliciosa 6in Pot","category":"plants","price":34.99,"sale_price":None,"sku":"PLT-MON-6","stock":18,"rating":4.8,"review_count":234,"skill_level":"beginner","description":"Iconic tropical plant with large, fenestrated leaves. Easy care, great for living rooms.","image_url":"/images/monstera.jpg","tags":["indoor","tropical","low-maintenance"],"care":{"water":"Every 1-2 weeks","light":"Bright indirect","humidity":"High"}},
    {"id":"P002","name":"Fiddle Leaf Fig 10in Pot","category":"plants","price":89.99,"sale_price":74.99,"sku":"PLT-FLF-10","stock":6,"rating":4.5,"review_count":189,"skill_level":"intermediate","description":"Statement tree with large violin-shaped leaves. Prefers stable environment.","image_url":"/images/fiddle-leaf.jpg","tags":["indoor","statement","tree"],"care":{"water":"Weekly","light":"Bright direct/indirect","humidity":"Medium"}},
    {"id":"P003","name":"Pothos Golden 4in Hanging","category":"plants","price":12.99,"sale_price":None,"sku":"PLT-POT-4","stock":45,"rating":4.9,"review_count":512,"skill_level":"beginner","description":"The most forgiving houseplant. Trails beautifully, tolerates low light.","image_url":"/images/pothos.jpg","tags":["indoor","trailing","beginner-friendly","low-light"],"care":{"water":"Every 2 weeks","light":"Low to bright indirect","humidity":"Any"}},
    {"id":"P004","name":"Snake Plant Laurentii 8in","category":"plants","price":28.99,"sale_price":None,"sku":"PLT-SNK-8","stock":32,"rating":4.7,"review_count":341,"skill_level":"beginner","description":"Air-purifying architectural plant. Nearly indestructible.","image_url":"/images/snake-plant.jpg","tags":["indoor","air-purifying","drought-tolerant"],"care":{"water":"Every 3-4 weeks","light":"Any","humidity":"Low"}},
    {"id":"P005","name":"Peace Lily 6in","category":"plants","price":22.99,"sale_price":19.99,"sku":"PLT-PEA-6","stock":24,"rating":4.6,"review_count":178,"skill_level":"beginner","description":"Elegant white blooms and glossy leaves. Great for low light.","image_url":"/images/peace-lily.jpg","tags":["indoor","flowering","low-light","air-purifying"],"care":{"water":"Weekly","light":"Low to medium indirect","humidity":"High"}},
    {"id":"P006","name":"Premium Potting Mix 8qt","category":"soil","price":18.99,"sale_price":None,"sku":"SOIL-MIX-8","stock":60,"rating":4.7,"review_count":203,"skill_level":"beginner","description":"All-purpose potting soil with perlite, worm castings, and slow-release fertilizer.","image_url":"/images/potting-mix.jpg","tags":["soil","all-purpose","fertilized"]},
    {"id":"P007","name":"Orchid & Succulent Mix 4qt","category":"soil","price":14.99,"sale_price":None,"sku":"SOIL-ORC-4","stock":38,"rating":4.5,"review_count":92,"skill_level":"beginner","description":"Fast-draining blend with bark, perlite, and coarse sand. Perfect for epiphytes.","image_url":"/images/orchid-mix.jpg","tags":["soil","orchid","succulent","cactus","fast-draining"]},
    {"id":"P008","name":"Liquid Fertilizer 32oz All-Purpose","category":"fertilizers","price":16.99,"sale_price":13.99,"sku":"FERT-LIQ-32","stock":41,"rating":4.6,"review_count":167,"skill_level":"beginner","description":"Balanced 10-10-10 formula. Safe for all houseplants. Use monthly.","image_url":"/images/fertilizer.jpg","tags":["fertilizer","liquid","all-purpose"]},
    {"id":"P009","name":"Self-Watering Ceramic Pot 8in White","category":"pots","price":39.99,"sale_price":None,"sku":"POT-CER-8W","stock":15,"rating":4.8,"review_count":128,"skill_level":"beginner","description":"Modern matte white with built-in water reservoir. Never overwater again.","image_url":"/images/ceramic-pot.jpg","tags":["pot","ceramic","self-watering","modern"]},
    {"id":"P010","name":"Terracotta Pot Set 4/6/8in (3-pack)","category":"pots","price":24.99,"sale_price":19.99,"sku":"POT-TER-SET3","stock":27,"rating":4.7,"review_count":215,"skill_level":"beginner","description":"Classic unglazed terracotta. Breathable walls promote healthy roots.","image_url":"/images/terracotta-set.jpg","tags":["pot","terracotta","classic","breathable"]},
    {"id":"P011","name":"Watering Can Copper 1.5L","category":"tools","price":34.99,"sale_price":None,"sku":"TOOL-WC-COP","stock":12,"rating":4.9,"review_count":87,"skill_level":"beginner","description":"Elegant copper-finish watering can with long narrow spout for precision watering.","image_url":"/images/watering-can.jpg","tags":["tool","watering","copper","gift"]},
    {"id":"P012","name":"Pruning Shears Professional","category":"tools","price":29.99,"sale_price":24.99,"sku":"TOOL-PRU-PRO","stock":20,"rating":4.8,"review_count":145,"skill_level":"beginner","description":"Bypass blade pruners with ergonomic grip. Titanium-coated blade stays sharp.","image_url":"/images/pruners.jpg","tags":["tool","pruning","shears","ergonomic"]},
    {"id":"P013","name":"Grow Light Full Spectrum 45W","category":"lighting","price":54.99,"sale_price":44.99,"sku":"LIGHT-GRW-45","stock":9,"rating":4.6,"review_count":203,"skill_level":"beginner","description":"Flexible gooseneck arm, 3 spectrum settings, timer included. Covers 3ft area.","image_url":"/images/grow-light.jpg","tags":["lighting","grow-light","indoor","timer"]},
    {"id":"P014","name":"Humidifier Cool Mist 1.5L","category":"accessories","price":44.99,"sale_price":None,"sku":"ACC-HUM-15","stock":14,"rating":4.5,"review_count":96,"skill_level":"beginner","description":"Ultra-quiet ultrasonic humidifier. Auto shut-off, runs 12h. Perfect for tropical plants.","image_url":"/images/humidifier.jpg","tags":["humidifier","tropical","accessories"]},
    {"id":"P015","name":"Moisture & pH Meter 3-in-1","category":"accessories","price":19.99,"sale_price":None,"sku":"ACC-MPH-3","stock":33,"rating":4.4,"review_count":172,"skill_level":"beginner","description":"Measures moisture, pH, and light levels. No batteries needed. Essential beginner tool.","image_url":"/images/moisture-meter.jpg","tags":["meter","moisture","pH","light","essential"]},
    {"id":"P016","name":"Cactus & Succulent Collection 4-Pack","category":"plants","price":32.99,"sale_price":27.99,"sku":"PLT-CAC-4PK","stock":22,"rating":4.7,"review_count":288,"skill_level":"beginner","description":"Curated 4-pack of easy succulents in 2in pots. Great for desks and windowsills.","image_url":"/images/cactus-pack.jpg","tags":["cactus","succulent","collection","desk","beginner-friendly"],"care":{"water":"Every 3-4 weeks","light":"Bright direct","humidity":"Low"}},
    {"id":"P017","name":"Monstera Adansonii Hanging 4in","category":"plants","price":18.99,"sale_price":None,"sku":"PLT-MAD-4","stock":16,"rating":4.6,"review_count":134,"skill_level":"beginner","description":"The swiss cheese vine. Smaller holes than deliciosa, perfect for hanging baskets.","image_url":"/images/adansonii.jpg","tags":["indoor","trailing","monstera","hanging"],"care":{"water":"Weekly","light":"Bright indirect","humidity":"High"}},
    {"id":"P018","name":"Plant Bundle - Beginner Starter Kit","category":"bundles","price":79.99,"sale_price":64.99,"sku":"BND-BGN-01","stock":8,"rating":4.9,"review_count":67,"skill_level":"beginner","description":"Everything to start your plant journey: Pothos, Snake Plant, Potting Mix, Pot, Moisture Meter.","image_url":"/images/starter-bundle.jpg","tags":["bundle","beginner","starter","gift","value"]},
    {"id":"P019","name":"Neem Oil Spray 16oz Organic","category":"pest-control","price":14.99,"sale_price":None,"sku":"PEST-NIM-16","stock":29,"rating":4.5,"review_count":118,"skill_level":"beginner","description":"100% cold-pressed neem oil. Controls spider mites, aphids, fungus gnats organically.","image_url":"/images/neem-oil.jpg","tags":["pest-control","organic","neem","fungal"]},
    {"id":"P020","name":"Hanging Macrame Plant Holder Set of 3","category":"decor","price":27.99,"sale_price":22.99,"sku":"DEC-MAC-3PK","stock":19,"rating":4.7,"review_count":156,"skill_level":"beginner","description":"Handmade cotton macrame in natural, sage, and terracotta. Fits up to 6in pots.","image_url":"/images/macrame.jpg","tags":["decor","macrame","hanging","boho","gift"]},
]

CATEGORY_MAP = {}
for p in PRODUCTS:
    CATEGORY_MAP.setdefault(p["category"], []).append(p)


class ProductCatalog:
    async def search(self, query: str = None, category: str = None, limit: int = 10) -> list:
        await asyncio.sleep(0.1)
        results = list(PRODUCTS)
        if category:
            results = [p for p in results if p["category"] == category]
        if query:
            ql = query.lower()
            results = [p for p in results if
                       ql in p["name"].lower() or
                       ql in p["description"].lower() or
                       any(ql in t for t in p.get("tags", []))]
        return results[:limit]

    async def get(self, product_id: str) -> dict:
        await asyncio.sleep(0.05)
        for p in PRODUCTS:
            if p["id"] == product_id:
                return p
        return None

    async def recommend(self, need: str = "", category: str = None,
                        budget_max: float = None, skill_level: str = "beginner") -> list:
        await asyncio.sleep(0.2)
        results = list(PRODUCTS)
        if category:
            results = [p for p in results if p["category"] == category]
        if budget_max:
            results = [p for p in results if p["price"] <= budget_max]
        if skill_level:
            results = [p for p in results if p.get("skill_level", "beginner") == skill_level]
        if need:
            nl = need.lower()
            scored = []
            for p in results:
                score = p["rating"]
                if any(t in nl for t in p.get("tags", [])): score += 2
                if nl in p["name"].lower(): score += 3
                if nl in p["description"].lower(): score += 1
                scored.append((score, p))
            scored.sort(key=lambda x: -x[0])
            results = [p for _, p in scored]
        return results[:5]

    async def identify_from_image(self, b64: str, mime_type: str) -> list:
        """In production: call Gemini Vision with the image."""
        await asyncio.sleep(0.3)
        return await self.search(query="monstera", limit=3)
