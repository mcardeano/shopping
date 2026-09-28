import type { ShoppingCategory } from "../domain/categories";

/**
 * Canonical ingredient catalogue.
 * Source of truth for normalization, categorization, pantry priors and nutrition estimates.
 * It is also written to the `ingredients` / `ingredient_aliases` tables at startup.
 */

export type IngredientRole = "protein" | "carb" | "veg" | "fruit" | "herb" | "flavor" | "fat" | "dairy" | "other";

export type CatalogIngredient = {
  name: string;
  category: ShoppingCategory;
  role: IngredientRole;
  aliases?: string[];
  /** Prior probability that a typical household has it at home (0–1). */
  stapleness?: number;
  /** Typical days a pack lasts / between purchases. */
  repurchaseDays?: number;
  /** Per 100 g: kcal, protein, carbs, fat. */
  macros?: [number, number, number, number];
  /** Grams for one countable item ("2 avocados"). */
  gramsPerPiece?: number;
  /** Noun used for counts when no unit: "2 fillets". */
  countNoun?: string;
  /** Taste keys this ingredient contributes (used by taste memory). */
  flavorKeys?: string[];
};

const I = (
  name: string,
  category: ShoppingCategory,
  role: IngredientRole,
  opts: Omit<CatalogIngredient, "name" | "category" | "role"> = {},
): CatalogIngredient => ({ name, category, role, ...opts });

export const INGREDIENTS: CatalogIngredient[] = [
  // ── Meat & fish ────────────────────────────────────────────────────────────
  I("salmon", "Meat & Fish", "protein", { aliases: ["salmon fillet", "salmon fillets", "salmon steak", "fresh salmon", "skin-on salmon"], repurchaseDays: 7, macros: [208, 20, 0, 13], gramsPerPiece: 130, countNoun: "fillets" }),
  I("sushi-grade salmon", "Meat & Fish", "protein", { aliases: ["sashimi salmon", "sushi grade salmon"], repurchaseDays: 7, macros: [208, 20, 0, 13], gramsPerPiece: 130 }),
  I("tuna", "Meat & Fish", "protein", { aliases: ["tuna steak", "fresh tuna", "sushi-grade tuna", "sushi grade tuna", "sashimi tuna"], repurchaseDays: 7, macros: [132, 28, 0, 1], gramsPerPiece: 150 }),
  I("canned tuna", "Pantry", "protein", { aliases: ["tinned tuna", "tuna in olive oil"], stapleness: 0.4, repurchaseDays: 30, macros: [116, 26, 0, 1], gramsPerPiece: 160 }),
  I("prawns", "Meat & Fish", "protein", { aliases: ["shrimp", "king prawns", "raw prawns", "tiger prawns", "raw king prawns", "peeled prawns"], repurchaseDays: 10, macros: [99, 24, 0, 0.3] }),
  I("white fish", "Meat & Fish", "protein", { aliases: ["cod", "cod fillet", "hake", "sea bass"], repurchaseDays: 7, macros: [82, 18, 0, 0.7], gramsPerPiece: 140 }),
  I("chicken breast", "Meat & Fish", "protein", { aliases: ["chicken breasts", "chicken breast fillets", "boneless chicken breast", "skinless chicken breast"], repurchaseDays: 6, macros: [120, 23, 0, 2.6], gramsPerPiece: 180, countNoun: "breasts" }),
  I("chicken thighs", "Meat & Fish", "protein", { aliases: ["chicken thigh", "boneless chicken thighs", "skinless chicken thighs", "chicken thigh fillets", "boneless skinless chicken thighs"], repurchaseDays: 6, macros: [177, 19, 0, 11], gramsPerPiece: 110, countNoun: "thighs" }),
  I("chicken", "Meat & Fish", "protein", { aliases: ["whole chicken"], repurchaseDays: 7, macros: [165, 25, 0, 7] }),
  I("beef steak", "Meat & Fish", "protein", { aliases: ["sirloin steak", "rump steak", "flank steak", "steak", "ribeye", "sirloin", "skirt steak", "bavette", "beef sirloin"], repurchaseDays: 10, macros: [200, 26, 0, 10], gramsPerPiece: 220 }),
  I("beef mince", "Meat & Fish", "protein", { aliases: ["minced beef", "ground beef", "lean beef mince"], repurchaseDays: 10, macros: [217, 26, 0, 12] }),
  I("beef", "Meat & Fish", "protein", { aliases: ["thinly sliced beef", "beef strips"], repurchaseDays: 10, macros: [217, 26, 0, 12] }),
  I("pork", "Meat & Fish", "protein", { aliases: ["pork mince", "pork belly", "pork tenderloin"], repurchaseDays: 10, macros: [242, 27, 0, 14] }),
  I("lamb", "Meat & Fish", "protein", { aliases: ["lamb mince", "lamb chops"], repurchaseDays: 14, macros: [282, 25, 0, 20] }),
  I("bacon", "Meat & Fish", "protein", { aliases: ["pancetta", "lardons"], repurchaseDays: 14, macros: [541, 37, 1, 42] }),
  I("chorizo", "Meat & Fish", "protein", { repurchaseDays: 21, macros: [455, 24, 2, 38] }),

  // ── Eggs, dairy, tofu ──────────────────────────────────────────────────────
  I("eggs", "Dairy & Eggs", "protein", { aliases: ["egg", "free-range eggs", "large eggs"], stapleness: 0.6, repurchaseDays: 10, macros: [143, 13, 1, 10], gramsPerPiece: 55, countNoun: "eggs" }),
  I("tofu", "Dairy & Eggs", "protein", { aliases: ["firm tofu", "extra-firm tofu", "extra firm tofu"], repurchaseDays: 10, macros: [144, 17, 3, 9], gramsPerPiece: 400 }),
  I("greek yogurt", "Dairy & Eggs", "dairy", { aliases: ["greek yoghurt", "greek-style yogurt", "greek style yogurt", "fage", "fage yogurt", "fage total", "oikos", "skyr", "strained yogurt", "yogurt for breakfast"], stapleness: 0.3, repurchaseDays: 7, macros: [97, 9, 4, 5] }),
  I("natural yogurt", "Dairy & Eggs", "dairy", { aliases: ["plain yogurt", "natural yoghurt", "plain yoghurt", "yogurt", "yoghurt"], stapleness: 0.3, repurchaseDays: 7, macros: [61, 3.5, 4.7, 3.3] }),
  I("milk", "Dairy & Eggs", "dairy", { aliases: ["whole milk", "semi-skimmed milk", "skimmed milk", "oat milk"], stapleness: 0.6, repurchaseDays: 5, macros: [50, 3.4, 4.8, 1.8] }),
  I("butter", "Dairy & Eggs", "fat", { aliases: ["unsalted butter", "salted butter"], stapleness: 0.75, repurchaseDays: 21, macros: [717, 1, 0, 81] }),
  I("double cream", "Dairy & Eggs", "dairy", { aliases: ["heavy cream", "cream", "single cream"], repurchaseDays: 10, macros: [445, 2, 3, 48] }),
  I("crème fraîche", "Dairy & Eggs", "dairy", { aliases: ["creme fraiche"], repurchaseDays: 10, macros: [292, 2.4, 2.8, 30] }),
  I("feta", "Dairy & Eggs", "dairy", { aliases: ["feta cheese", "block of feta", "feta block"], repurchaseDays: 14, macros: [264, 14, 4, 21], gramsPerPiece: 200, flavorKeys: ["cheese"] }),
  I("burrata", "Dairy & Eggs", "dairy", { repurchaseDays: 7, macros: [300, 17, 2, 25], gramsPerPiece: 125, flavorKeys: ["cheese"] }),
  I("mozzarella", "Dairy & Eggs", "dairy", { aliases: ["fresh mozzarella", "mozzarella ball"], repurchaseDays: 10, macros: [280, 28, 3, 17], gramsPerPiece: 125, flavorKeys: ["cheese"] }),
  I("parmesan", "Dairy & Eggs", "dairy", { aliases: ["parmigiano reggiano", "parmigiano", "grana padano", "pecorino"], stapleness: 0.5, repurchaseDays: 30, macros: [431, 38, 4, 29], flavorKeys: ["cheese"] }),
  I("halloumi", "Dairy & Eggs", "dairy", { repurchaseDays: 14, macros: [321, 21, 2, 25], gramsPerPiece: 225, flavorKeys: ["cheese"] }),
  I("blue cheese", "Dairy & Eggs", "dairy", { aliases: ["gorgonzola", "stilton", "roquefort"], macros: [353, 21, 2, 29], flavorKeys: ["cheese"] }),
  I("cheddar", "Dairy & Eggs", "dairy", { aliases: ["cheddar cheese", "grated cheese", "cheese"], stapleness: 0.5, repurchaseDays: 14, macros: [403, 25, 1, 33], flavorKeys: ["cheese"] }),
  I("labneh", "Dairy & Eggs", "dairy", { macros: [160, 6, 4, 13] }),

  // ── Produce ────────────────────────────────────────────────────────────────
  I("avocado", "Produce", "fat", { aliases: ["avocados", "ripe avocado", "hass avocado"], repurchaseDays: 5, macros: [160, 2, 9, 15], gramsPerPiece: 150, countNoun: "avocados" }),
  I("cucumber", "Produce", "veg", { aliases: ["cucumbers", "english cucumber", "baby cucumbers", "mini cucumbers", "persian cucumbers"], repurchaseDays: 6, macros: [15, 0.7, 3.6, 0.1], gramsPerPiece: 300 }),
  I("spring onions", "Produce", "veg", { aliases: ["spring onion", "scallions", "scallion", "green onions", "green onion", "salad onions"], repurchaseDays: 7, macros: [32, 1.8, 7, 0.2], gramsPerPiece: 15, flavorKeys: ["spring onion"] }),
  I("red onion", "Produce", "veg", { aliases: ["red onions"], stapleness: 0.45, repurchaseDays: 14, macros: [40, 1.1, 9, 0.1], gramsPerPiece: 150 }),
  I("onion", "Produce", "veg", { aliases: ["onions", "brown onion", "yellow onion", "white onion", "brown onions"], stapleness: 0.6, repurchaseDays: 14, macros: [40, 1.1, 9, 0.1], gramsPerPiece: 150 }),
  I("shallot", "Produce", "veg", { aliases: ["shallots", "banana shallot"], stapleness: 0.3, repurchaseDays: 14, macros: [72, 2.5, 17, 0.1], gramsPerPiece: 40 }),
  I("garlic", "Produce", "flavor", { aliases: ["garlic clove", "garlic cloves", "head of garlic", "garlic bulb"], stapleness: 0.55, repurchaseDays: 14, macros: [149, 6, 33, 0.5], gramsPerPiece: 5, flavorKeys: ["garlic"] }),
  I("fresh ginger", "Produce", "flavor", { aliases: ["ginger", "root ginger", "ginger root", "thumb of ginger"], stapleness: 0.35, repurchaseDays: 21, macros: [80, 1.8, 18, 0.8], gramsPerPiece: 20, flavorKeys: ["ginger"] }),
  I("red chilli", "Produce", "flavor", { aliases: ["red chili", "red chillies", "fresh chilli", "chilli", "chili", "bird's eye chilli", "birds eye chilli", "green chilli", "jalapeño", "jalapeno"], repurchaseDays: 10, macros: [40, 2, 9, 0.4], gramsPerPiece: 10, flavorKeys: ["spicy"] }),
  I("lemon", "Produce", "flavor", { aliases: ["lemons", "unwaxed lemon", "lemon juice", "lemon zest"], stapleness: 0.45, repurchaseDays: 10, macros: [29, 1.1, 9, 0.3], gramsPerPiece: 100, flavorKeys: ["lemon"] }),
  I("lime", "Produce", "flavor", { aliases: ["limes", "lime juice", "lime zest"], stapleness: 0.3, repurchaseDays: 10, macros: [30, 0.7, 11, 0.2], gramsPerPiece: 60, flavorKeys: ["lime"] }),
  I("cherry tomatoes", "Produce", "veg", { aliases: ["cherry tomato", "baby plum tomatoes", "plum tomatoes", "grape tomatoes", "vine tomatoes", "tomatoes", "tomato"], repurchaseDays: 6, macros: [18, 0.9, 3.9, 0.2], gramsPerPiece: 15 }),
  I("red pepper", "Produce", "veg", { aliases: ["red peppers", "bell pepper", "bell peppers", "red bell pepper", "yellow pepper", "peppers", "pepper strips"], repurchaseDays: 10, macros: [31, 1, 6, 0.3], gramsPerPiece: 160 }),
  I("courgette", "Produce", "veg", { aliases: ["courgettes", "zucchini", "zucchinis"], repurchaseDays: 7, macros: [17, 1.2, 3.1, 0.3], gramsPerPiece: 200, countNoun: "courgettes" }),
  I("aubergine", "Produce", "veg", { aliases: ["aubergines", "eggplant"], repurchaseDays: 7, macros: [25, 1, 6, 0.2], gramsPerPiece: 300 }),
  I("cauliflower", "Produce", "veg", { aliases: ["cauliflower head", "head of cauliflower"], repurchaseDays: 7, macros: [25, 1.9, 5, 0.3], gramsPerPiece: 700 }),
  I("broccoli", "Produce", "veg", { aliases: ["broccoli florets", "tenderstem broccoli", "broccolini", "tenderstem"], repurchaseDays: 6, macros: [34, 2.8, 7, 0.4], gramsPerPiece: 350 }),
  I("carrot", "Produce", "veg", { aliases: ["carrots"], stapleness: 0.4, repurchaseDays: 14, macros: [41, 0.9, 10, 0.2], gramsPerPiece: 80 }),
  I("spinach", "Produce", "veg", { aliases: ["baby spinach", "spinach leaves"], repurchaseDays: 5, macros: [23, 2.9, 3.6, 0.4] }),
  I("rocket", "Produce", "veg", { aliases: ["arugula", "wild rocket"], repurchaseDays: 5, macros: [25, 2.6, 3.7, 0.7] }),
  I("salad leaves", "Produce", "veg", { aliases: ["mixed leaves", "mixed salad leaves", "lettuce", "little gem", "little gem lettuce", "romaine", "romaine lettuce", "cos lettuce", "gem lettuce", "butter lettuce"], repurchaseDays: 5, macros: [15, 1.4, 2.9, 0.2], gramsPerPiece: 150 }),
  I("pak choi", "Produce", "veg", { aliases: ["bok choy", "bok choi", "baby pak choi", "baby bok choy", "choy sum"], repurchaseDays: 6, macros: [13, 1.5, 2.2, 0.2], gramsPerPiece: 120 }),
  I("kale", "Produce", "veg", { aliases: ["cavolo nero"], repurchaseDays: 6, macros: [49, 4.3, 9, 0.9] }),
  I("cabbage", "Produce", "veg", { aliases: ["red cabbage", "white cabbage", "savoy cabbage", "napa cabbage", "shredded cabbage"], repurchaseDays: 14, macros: [25, 1.3, 6, 0.1], gramsPerPiece: 800 }),
  I("edamame", "Frozen", "protein", { aliases: ["edamame beans", "shelled edamame", "frozen edamame"], stapleness: 0.3, repurchaseDays: 30, macros: [121, 12, 9, 5] }),
  I("sweet potato", "Produce", "carb", { aliases: ["sweet potatoes"], repurchaseDays: 14, macros: [86, 1.6, 20, 0.1], gramsPerPiece: 250 }),
  I("potatoes", "Produce", "carb", { aliases: ["potato", "new potatoes", "baby potatoes", "waxy potatoes"], stapleness: 0.4, repurchaseDays: 14, macros: [77, 2, 17, 0.1], gramsPerPiece: 150 }),
  I("mushrooms", "Produce", "veg", { aliases: ["mushroom", "chestnut mushrooms", "shiitake", "shiitake mushrooms", "button mushrooms"], repurchaseDays: 6, macros: [22, 3.1, 3.3, 0.3] }),
  I("radish", "Produce", "veg", { aliases: ["radishes"], repurchaseDays: 7, macros: [16, 0.7, 3.4, 0.1], gramsPerPiece: 10 }),
  I("mango", "Produce", "fruit", { aliases: ["mangoes"], repurchaseDays: 5, macros: [60, 0.8, 15, 0.4], gramsPerPiece: 300 }),
  I("pomegranate", "Produce", "fruit", { aliases: ["pomegranate seeds", "pomegranate arils"], repurchaseDays: 10, macros: [83, 1.7, 19, 1.2], gramsPerPiece: 250 }),
  I("banana", "Produce", "fruit", { aliases: ["bananas"], repurchaseDays: 5, macros: [89, 1.1, 23, 0.3], gramsPerPiece: 120, countNoun: "bananas" }),
  I("strawberries", "Produce", "fruit", { aliases: ["strawberry"], repurchaseDays: 5, macros: [32, 0.7, 7.7, 0.3] }),
  I("blueberries", "Produce", "fruit", { aliases: ["blueberry"], repurchaseDays: 6, macros: [57, 0.7, 14, 0.3] }),
  I("apples", "Produce", "fruit", { aliases: ["apple"], repurchaseDays: 10, macros: [52, 0.3, 14, 0.2], gramsPerPiece: 180 }),
  I("oranges", "Produce", "fruit", { aliases: ["orange", "clementines", "satsumas"], repurchaseDays: 10, macros: [47, 0.9, 12, 0.1], gramsPerPiece: 150 }),
  I("grapes", "Produce", "fruit", { macros: [69, 0.7, 18, 0.2] }),

  // Herbs
  I("coriander", "Produce", "herb", { aliases: ["fresh coriander", "cilantro", "coriander leaves"], repurchaseDays: 6, macros: [23, 2.1, 3.7, 0.5], flavorKeys: ["herbs"] }),
  I("parsley", "Produce", "herb", { aliases: ["flat-leaf parsley", "flat leaf parsley", "fresh parsley", "italian parsley"], repurchaseDays: 6, macros: [36, 3, 6, 0.8], flavorKeys: ["herbs"] }),
  I("mint", "Produce", "herb", { aliases: ["fresh mint", "mint leaves"], repurchaseDays: 6, macros: [44, 3.3, 8, 0.7], flavorKeys: ["herbs"] }),
  I("basil", "Produce", "herb", { aliases: ["fresh basil", "basil leaves", "thai basil"], repurchaseDays: 6, macros: [23, 3.2, 2.7, 0.6], flavorKeys: ["herbs"] }),
  I("dill", "Produce", "herb", { aliases: ["fresh dill"], repurchaseDays: 6, macros: [43, 3.5, 7, 1.1], flavorKeys: ["herbs"] }),
  I("thyme", "Produce", "herb", { aliases: ["fresh thyme", "thyme sprigs"], stapleness: 0.3, repurchaseDays: 14, macros: [101, 5.6, 24, 1.7], flavorKeys: ["herbs"] }),
  I("rosemary", "Produce", "herb", { aliases: ["fresh rosemary", "rosemary sprigs"], stapleness: 0.3, repurchaseDays: 14, macros: [131, 3.3, 21, 5.9], flavorKeys: ["herbs"] }),
  I("lemongrass", "Produce", "flavor", { aliases: ["lemongrass stalk", "lemongrass stalks"], repurchaseDays: 14, macros: [99, 1.8, 25, 0.5] }),

  // ── Carbs & pantry ─────────────────────────────────────────────────────────
  I("jasmine rice", "Pantry", "carb", { aliases: ["rice", "white rice", "long-grain rice", "long grain rice", "basmati rice", "basmati", "cooked rice", "steamed rice", "brown rice"], stapleness: 0.8, repurchaseDays: 40, macros: [360, 7, 79, 0.6] }),
  I("sushi rice", "Pantry", "carb", { aliases: ["short-grain rice", "short grain rice", "japanese rice", "calrose rice"], stapleness: 0.6, repurchaseDays: 45, macros: [360, 6.5, 80, 0.5] }),
  I("couscous", "Pantry", "carb", { aliases: ["giant couscous", "pearl couscous", "moghrabieh"], stapleness: 0.45, repurchaseDays: 45, macros: [376, 13, 77, 0.6] }),
  I("orzo", "Pantry", "carb", { aliases: ["orzo pasta", "risoni"], stapleness: 0.3, repurchaseDays: 45, macros: [357, 12, 72, 1.5] }),
  I("pasta", "Pantry", "carb", { aliases: ["spaghetti", "linguine", "penne", "rigatoni", "fusilli", "paccheri", "tagliatelle", "casarecce", "short pasta", "dried pasta"], stapleness: 0.7, repurchaseDays: 30, macros: [357, 12, 72, 1.5] }),
  I("egg noodles", "Pantry", "carb", { aliases: ["noodles", "udon noodles", "udon", "ramen noodles", "soba noodles", "soba", "wheat noodles", "lo mein noodles"], stapleness: 0.4, repurchaseDays: 30, macros: [384, 14, 71, 4.4] }),
  I("rice noodles", "Pantry", "carb", { aliases: ["vermicelli", "rice vermicelli", "flat rice noodles", "glass noodles"], stapleness: 0.3, repurchaseDays: 40, macros: [364, 6, 80, 0.6] }),
  I("quinoa", "Pantry", "carb", { stapleness: 0.3, repurchaseDays: 45, macros: [368, 14, 64, 6] }),
  I("bulgur wheat", "Pantry", "carb", { aliases: ["bulgur", "bulghur"], stapleness: 0.2, repurchaseDays: 45, macros: [342, 12, 76, 1.3] }),
  I("pitta bread", "Bakery", "carb", { aliases: ["pita", "pita bread", "pitta", "pittas", "pitas", "flatbread", "flatbreads", "wraps", "tortillas", "tortilla wraps", "naan"], repurchaseDays: 7, macros: [275, 9, 55, 1.2], gramsPerPiece: 60, countNoun: "pittas" }),
  I("bread", "Bakery", "carb", { aliases: ["sourdough", "sourdough bread", "loaf", "crusty bread", "ciabatta", "baguette"], stapleness: 0.5, repurchaseDays: 4, macros: [265, 9, 49, 3.2] }),
  I("panko breadcrumbs", "Pantry", "carb", { aliases: ["panko", "breadcrumbs"], stapleness: 0.4, repurchaseDays: 60, macros: [395, 12, 78, 4] }),
  I("chickpeas", "Pantry", "protein", { aliases: ["chickpea", "canned chickpeas", "tinned chickpeas", "garbanzo beans"], stapleness: 0.55, repurchaseDays: 30, macros: [139, 7, 16, 2.6], gramsPerPiece: 240, flavorKeys: ["chickpeas"] }),
  I("lentils", "Pantry", "protein", { aliases: ["red lentils", "green lentils", "puy lentils", "beluga lentils"], stapleness: 0.4, repurchaseDays: 45, macros: [352, 25, 63, 1] }),
  I("white beans", "Pantry", "protein", { aliases: ["cannellini beans", "butter beans", "haricot beans"], stapleness: 0.4, repurchaseDays: 30, macros: [110, 7, 17, 0.5], gramsPerPiece: 240 }),
  I("black beans", "Pantry", "protein", { stapleness: 0.3, repurchaseDays: 30, macros: [132, 9, 24, 0.5], gramsPerPiece: 240 }),
  I("chopped tomatoes", "Pantry", "veg", { aliases: ["canned tomatoes", "tinned tomatoes", "crushed tomatoes", "passata", "tomato passata", "whole plum tomatoes"], stapleness: 0.6, repurchaseDays: 30, macros: [32, 1.6, 7, 0.3], gramsPerPiece: 400 }),
  I("tomato paste", "Pantry", "flavor", { aliases: ["tomato purée", "tomato puree", "concentrated tomato paste"], stapleness: 0.55, repurchaseDays: 45, macros: [82, 4.3, 19, 0.5] }),
  I("coconut milk", "Pantry", "fat", { aliases: ["light coconut milk", "coconut cream"], stapleness: 0.4, repurchaseDays: 45, macros: [197, 2, 3, 21], gramsPerPiece: 400 }),
  I("chicken stock", "Pantry", "flavor", { aliases: ["stock", "chicken broth", "vegetable stock", "stock cube", "chicken stock cube", "vegetable broth", "bouillon"], stapleness: 0.65, repurchaseDays: 45, macros: [5, 0.5, 0.4, 0.2] }),
  I("peanut butter", "Pantry", "fat", { aliases: ["smooth peanut butter", "crunchy peanut butter"], stapleness: 0.55, repurchaseDays: 30, macros: [588, 25, 20, 50], flavorKeys: ["peanut"] }),
  I("peanuts", "Pantry", "fat", { aliases: ["roasted peanuts", "salted peanuts", "crushed peanuts"], stapleness: 0.35, repurchaseDays: 45, macros: [567, 26, 16, 49], flavorKeys: ["peanut"] }),
  I("cashews", "Pantry", "fat", { aliases: ["cashew nuts"], stapleness: 0.3, repurchaseDays: 45, macros: [553, 18, 30, 44] }),
  I("pine nuts", "Pantry", "fat", { stapleness: 0.3, repurchaseDays: 60, macros: [673, 14, 13, 68] }),
  I("almonds", "Pantry", "fat", { aliases: ["flaked almonds", "toasted almonds"], stapleness: 0.35, repurchaseDays: 60, macros: [579, 21, 22, 50] }),
  I("walnuts", "Pantry", "fat", { stapleness: 0.3, repurchaseDays: 60, macros: [654, 15, 14, 65] }),
  I("pistachios", "Pantry", "fat", { stapleness: 0.25, repurchaseDays: 60, macros: [560, 20, 28, 45] }),
  I("sesame seeds", "Pantry", "flavor", { aliases: ["toasted sesame seeds", "white sesame seeds", "black sesame seeds", "sesame"], stapleness: 0.6, repurchaseDays: 90, macros: [573, 18, 23, 50], flavorKeys: ["sesame"] }),
  I("nori", "Pantry", "flavor", { aliases: ["nori sheets", "seaweed", "roasted seaweed", "furikake"], stapleness: 0.3, repurchaseDays: 60, macros: [35, 6, 5, 0.3] }),
  I("dried apricots", "Pantry", "fruit", { aliases: ["apricots", "dates", "medjool dates", "raisins", "sultanas"], stapleness: 0.3, repurchaseDays: 60, macros: [241, 3.4, 63, 0.5] }),
  I("capers", "Pantry", "flavor", { stapleness: 0.35, repurchaseDays: 90, macros: [23, 2.4, 4.9, 0.9] }),
  I("olives", "Pantry", "fat", { aliases: ["kalamata olives", "black olives", "green olives", "pitted olives"], stapleness: 0.4, repurchaseDays: 45, macros: [115, 0.8, 6, 11] }),
  I("sun-dried tomatoes", "Pantry", "flavor", { aliases: ["sundried tomatoes", "sun dried tomatoes"], stapleness: 0.3, repurchaseDays: 60, macros: [213, 5, 23, 14] }),
  I("roasted red peppers", "Pantry", "veg", { aliases: ["jarred roasted peppers", "roasted peppers"], stapleness: 0.3, repurchaseDays: 45, macros: [25, 1, 5, 0.3] }),
  I("pesto", "Pantry", "flavor", { aliases: ["basil pesto", "green pesto", "fresh pesto"], stapleness: 0.35, repurchaseDays: 21, macros: [450, 5, 6, 45], flavorKeys: ["pesto"] }),
  I("flour", "Pantry", "carb", { aliases: ["plain flour", "all-purpose flour", "cornflour", "cornstarch", "corn starch", "potato starch"], stapleness: 0.8, repurchaseDays: 90, macros: [364, 10, 76, 1] }),
  I("sugar", "Pantry", "flavor", { aliases: ["caster sugar", "brown sugar", "light brown sugar", "granulated sugar", "palm sugar", "demerara sugar"], stapleness: 0.8, repurchaseDays: 90, macros: [387, 0, 100, 0], flavorKeys: ["sweet"] }),
  I("honey", "Pantry", "flavor", { aliases: ["runny honey", "maple syrup", "agave", "agave syrup"], stapleness: 0.7, repurchaseDays: 60, macros: [304, 0.3, 82, 0], flavorKeys: ["sweet"] }),

  // ── Oils, sauces, condiments ───────────────────────────────────────────────
  I("olive oil", "Pantry", "fat", { aliases: ["extra virgin olive oil", "extra-virgin olive oil", "evoo", "light olive oil"], stapleness: 0.85, repurchaseDays: 50, macros: [884, 0, 0, 100] }),
  I("neutral oil", "Pantry", "fat", { aliases: ["vegetable oil", "sunflower oil", "rapeseed oil", "groundnut oil", "canola oil", "avocado oil", "oil", "cooking oil", "peanut oil"], stapleness: 0.85, repurchaseDays: 60, macros: [884, 0, 0, 100] }),
  I("sesame oil", "Pantry", "flavor", { aliases: ["toasted sesame oil"], stapleness: 0.6, repurchaseDays: 90, macros: [884, 0, 0, 100], flavorKeys: ["sesame"] }),
  I("chilli oil", "Pantry", "flavor", { aliases: ["chili oil", "chilli crisp", "chili crisp", "crispy chilli oil", "chiu chow chilli oil"], stapleness: 0.4, repurchaseDays: 60, macros: [700, 2, 5, 75], flavorKeys: ["spicy"] }),
  I("soy sauce", "Pantry", "flavor", { aliases: ["light soy sauce", "dark soy sauce", "tamari", "shoyu", "low-sodium soy sauce", "reduced salt soy sauce", "soy"], stapleness: 0.8, repurchaseDays: 60, macros: [53, 8, 5, 0.6], flavorKeys: ["soy"] }),
  I("white miso", "Pantry", "flavor", { aliases: ["miso", "miso paste", "shiro miso", "red miso", "white miso paste"], stapleness: 0.35, repurchaseDays: 60, macros: [199, 12, 26, 6], flavorKeys: ["miso"] }),
  I("mirin", "Pantry", "flavor", { aliases: ["rice wine", "shaoxing wine", "sake", "shaoxing rice wine"], stapleness: 0.45, repurchaseDays: 90, macros: [241, 0.2, 43, 0], flavorKeys: ["sweet"] }),
  I("rice vinegar", "Pantry", "flavor", { aliases: ["rice wine vinegar", "seasoned rice vinegar", "black vinegar", "chinkiang vinegar"], stapleness: 0.55, repurchaseDays: 90, macros: [18, 0, 0.4, 0] }),
  I("red wine vinegar", "Pantry", "flavor", { aliases: ["white wine vinegar", "sherry vinegar", "cider vinegar", "apple cider vinegar", "vinegar", "balsamic vinegar", "balsamic"], stapleness: 0.65, repurchaseDays: 90, macros: [19, 0, 0.3, 0] }),
  I("fish sauce", "Pantry", "flavor", { aliases: ["nam pla"], stapleness: 0.4, repurchaseDays: 90, macros: [35, 5, 4, 0], flavorKeys: ["umami"] }),
  I("oyster sauce", "Pantry", "flavor", { aliases: ["hoisin sauce", "hoisin"], stapleness: 0.4, repurchaseDays: 90, macros: [51, 1.4, 11, 0.3], flavorKeys: ["umami"] }),
  I("gochujang", "Pantry", "flavor", { aliases: ["korean chilli paste", "gochugaru", "korean chili flakes"], stapleness: 0.3, repurchaseDays: 90, macros: [200, 4, 40, 2], flavorKeys: ["spicy", "gochujang"] }),
  I("sriracha", "Pantry", "flavor", { aliases: ["hot sauce", "chilli sauce", "sweet chilli sauce", "sambal oelek", "sambal"], stapleness: 0.5, repurchaseDays: 90, macros: [93, 2, 19, 1], flavorKeys: ["spicy"] }),
  I("teriyaki sauce", "Pantry", "flavor", { stapleness: 0.3, repurchaseDays: 60, macros: [89, 6, 16, 0], flavorKeys: ["soy", "sweet"] }),
  I("kewpie mayonnaise", "Pantry", "fat", { aliases: ["kewpie mayo", "japanese mayonnaise", "mayonnaise", "mayo"], stapleness: 0.6, repurchaseDays: 45, macros: [680, 1.5, 1, 75] }),
  I("dijon mustard", "Pantry", "flavor", { aliases: ["mustard", "wholegrain mustard"], stapleness: 0.65, repurchaseDays: 90, macros: [66, 4, 6, 3] }),
  I("tahini", "Pantry", "fat", { aliases: ["tahina", "sesame paste"], stapleness: 0.45, repurchaseDays: 60, macros: [595, 17, 21, 54], flavorKeys: ["tahini", "sesame"] }),
  I("harissa", "Pantry", "flavor", { aliases: ["rose harissa", "harissa paste"], stapleness: 0.3, repurchaseDays: 60, macros: [120, 3, 12, 7], flavorKeys: ["spicy", "harissa"] }),
  I("pomegranate molasses", "Pantry", "flavor", { stapleness: 0.25, repurchaseDays: 120, macros: [260, 0, 65, 0], flavorKeys: ["tangy"] }),
  I("thai curry paste", "Pantry", "flavor", { aliases: ["red curry paste", "green curry paste", "curry paste"], stapleness: 0.3, repurchaseDays: 90, macros: [100, 2, 10, 6], flavorKeys: ["spicy"] }),

  // ── Spices ─────────────────────────────────────────────────────────────────
  I("salt", "Pantry", "flavor", { aliases: ["sea salt", "flaky salt", "flaky sea salt", "kosher salt", "fine salt", "maldon salt"], stapleness: 0.97, repurchaseDays: 180 }),
  I("black pepper", "Pantry", "flavor", { aliases: ["pepper", "ground black pepper", "freshly ground black pepper", "cracked black pepper", "salt and pepper"], stapleness: 0.95, repurchaseDays: 180 }),
  I("ground cumin", "Pantry", "flavor", { aliases: ["cumin", "cumin seeds"], stapleness: 0.7, repurchaseDays: 180, flavorKeys: ["warm spices"] }),
  I("ground coriander", "Pantry", "flavor", { aliases: ["coriander seeds"], stapleness: 0.6, repurchaseDays: 180, flavorKeys: ["warm spices"] }),
  I("smoked paprika", "Pantry", "flavor", { aliases: ["paprika", "sweet paprika", "sweet smoked paprika", "pimentón"], stapleness: 0.75, repurchaseDays: 180, flavorKeys: ["smoky"] }),
  I("chilli flakes", "Pantry", "flavor", { aliases: ["chili flakes", "red pepper flakes", "crushed red pepper", "aleppo pepper", "pul biber", "urfa biber", "cayenne pepper", "cayenne", "chilli powder", "chili powder"], stapleness: 0.7, repurchaseDays: 180, flavorKeys: ["spicy"] }),
  I("ground turmeric", "Pantry", "flavor", { aliases: ["turmeric"], stapleness: 0.6, repurchaseDays: 180, flavorKeys: ["warm spices"] }),
  I("ground cinnamon", "Pantry", "flavor", { aliases: ["cinnamon", "cinnamon stick"], stapleness: 0.65, repurchaseDays: 180, flavorKeys: ["warm spices"] }),
  I("dried oregano", "Pantry", "flavor", { aliases: ["oregano", "dried thyme", "dried mixed herbs", "mixed herbs", "italian seasoning", "herbes de provence"], stapleness: 0.75, repurchaseDays: 180, flavorKeys: ["herbs"] }),
  I("za'atar", "Pantry", "flavor", { aliases: ["zaatar", "za’atar"], stapleness: 0.3, repurchaseDays: 180, flavorKeys: ["za'atar"] }),
  I("sumac", "Pantry", "flavor", { stapleness: 0.3, repurchaseDays: 180, flavorKeys: ["tangy"] }),
  I("shawarma spice", "Pantry", "flavor", { aliases: ["shawarma seasoning", "baharat", "ras el hanout", "seven spice", "7 spice", "garam masala", "curry powder", "allspice"], stapleness: 0.35, repurchaseDays: 180, flavorKeys: ["warm spices"] }),
  I("garlic powder", "Pantry", "flavor", { aliases: ["onion powder", "granulated garlic"], stapleness: 0.6, repurchaseDays: 180, flavorKeys: ["garlic"] }),
  I("five spice", "Pantry", "flavor", { aliases: ["chinese five spice", "five-spice", "star anise", "sichuan peppercorns"], stapleness: 0.35, repurchaseDays: 180 }),
];

/** Typical minimum pack sizes at a supermarket (for waste-aware planning). */
export const PACK_SIZES: Record<string, { amount: number; unit: string }> = {
  coriander: { amount: 1, unit: "bunch" },
  parsley: { amount: 1, unit: "bunch" },
  mint: { amount: 1, unit: "bunch" },
  basil: { amount: 1, unit: "bunch" },
  dill: { amount: 1, unit: "bunch" },
  "spring onions": { amount: 6, unit: "piece" },
  cucumber: { amount: 1, unit: "piece" },
  "greek yogurt": { amount: 500, unit: "g" },
  feta: { amount: 200, unit: "g" },
  spinach: { amount: 200, unit: "g" },
  rocket: { amount: 100, unit: "g" },
  "cherry tomatoes": { amount: 250, unit: "g" },
  salmon: { amount: 2, unit: "fillet" },
  "chicken thighs": { amount: 500, unit: "g" },
  "chicken breast": { amount: 2, unit: "piece" },
};

/** Ingredients so ubiquitous they're not worth listing as "needed" unless the user says so. */
export const ALWAYS_HAVE = new Set(["salt", "black pepper", "water"]);
