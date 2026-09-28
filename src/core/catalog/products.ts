import type { ShoppingCategory } from "../domain/categories";

/**
 * Non-food (and non-recipe) supermarket products. Deliberately separate from
 * ingredients: a shopping list item references either an Ingredient or a
 * ShoppingProduct, never forces one into the other.
 */
export type CatalogProduct = {
  name: string;
  category: ShoppingCategory;
  aliases?: string[];
  repurchaseDays?: number;
};

const P = (name: string, category: ShoppingCategory, aliases: string[] = [], repurchaseDays?: number): CatalogProduct => ({
  name,
  category,
  aliases,
  repurchaseDays,
});

export const PRODUCTS: CatalogProduct[] = [
  // Household
  P("toilet paper", "Household", ["toilet roll", "toilet rolls", "loo roll", "loo rolls", "bog roll", "toilet tissue"], 21),
  P("paper towels", "Household", ["kitchen roll", "kitchen paper", "paper towel", "kitchen towel"], 21),
  P("dishwasher tablets", "Household", ["dishwasher tabs", "dishwasher pods", "finish tablets", "finish", "dishwasher detergent", "dishwasher tablet"], 35),
  P("washing-up liquid", "Household", ["washing up liquid", "dish soap", "fairy", "fairy liquid", "dishwashing liquid"], 30),
  P("laundry detergent", "Household", ["washing detergent", "washing powder", "washing liquid", "laundry liquid", "laundry pods", "laundry capsules", "detergent"], 35),
  P("fabric softener", "Household", ["fabric conditioner", "softener"], 45),
  P("bin bags", "Household", ["bin liners", "rubbish bags", "trash bags", "garbage bags"], 30),
  P("cleaning spray", "Household", ["multi-surface spray", "surface cleaner", "all purpose cleaner", "cleaning products", "bleach", "kitchen cleaner", "bathroom cleaner"], 45),
  P("sponges", "Household", ["sponge", "scourers", "scourer"], 30),
  P("cling film", "Household", ["clingfilm", "plastic wrap", "beeswax wraps"], 90),
  P("foil", "Household", ["aluminium foil", "tin foil", "kitchen foil"], 90),
  P("baking paper", "Household", ["parchment paper", "greaseproof paper"], 90),
  P("freezer bags", "Household", ["sandwich bags", "zip bags", "ziplock bags"], 60),
  P("light bulbs", "Household", ["lightbulbs", "light bulb"]),
  P("batteries", "Household", ["aa batteries", "aaa batteries"]),
  P("hand soap", "Personal Care", ["handwash", "hand wash", "liquid soap"], 30),

  // Personal care
  P("toothpaste", "Personal Care", ["tooth paste"], 30),
  P("toothbrushes", "Personal Care", ["toothbrush", "toothbrush heads", "brush heads"], 90),
  P("shampoo", "Personal Care", [], 35),
  P("conditioner", "Personal Care", ["hair conditioner"], 45),
  P("shower gel", "Personal Care", ["body wash"], 30),
  P("deodorant", "Personal Care", ["deo", "antiperspirant"], 40),
  P("sun cream", "Personal Care", ["sunscreen", "suncream", "spf"]),
  P("razors", "Personal Care", ["razor blades"], 60),
  P("tissues", "Personal Care", ["facial tissues", "kleenex"], 30),
  P("cotton pads", "Personal Care", ["cotton wool", "cotton buds"], 60),
  P("painkillers", "Personal Care", ["paracetamol", "ibuprofen"]),
  P("plasters", "Personal Care", ["band-aids", "band aids"]),

  // Baby & kids
  P("nappies", "Baby", ["diapers", "nappy", "diaper", "pull-ups", "pull ups"], 10),
  P("baby wipes", "Baby", ["wipes", "wet wipes"], 14),
  P("baby food", "Baby", ["baby pouches", "fruit pouches", "pouches"], 10),
  P("formula", "Baby", ["baby formula", "infant formula"], 10),

  // Pets
  P("cat food", "Pets", ["cat litter", "cat treats"], 14),
  P("dog food", "Pets", ["dog treats", "pet food"], 14),

  // Drinks
  P("sparkling water", "Drinks", ["fizzy water", "soda water", "mineral water", "still water", "water bottles"], 7),
  P("coffee", "Drinks", ["coffee beans", "ground coffee", "coffee pods", "nespresso pods", "coffee capsules", "instant coffee"], 21),
  P("tea", "Drinks", ["tea bags", "teabags", "green tea", "herbal tea"], 30),
  P("orange juice", "Drinks", ["juice", "apple juice", "oj"], 7),
  P("wine", "Drinks", ["red wine", "white wine", "rosé", "rose wine", "prosecco"], 14),
  P("beer", "Drinks", ["beers", "lager"], 14),
  P("kombucha", "Drinks", [], 10),

  // Breakfast & snacks (not typically recipe ingredients here)
  P("granola", "Pantry", ["muesli", "cereal", "breakfast cereal", "oats", "porridge oats", "rolled oats"], 14),
  P("crisps", "Pantry", ["chips", "tortilla chips", "popcorn"], 10),
  P("biscuits", "Pantry", ["cookies", "crackers", "rice cakes", "oatcakes"], 14),
  P("dark chocolate", "Pantry", ["chocolate", "chocolate bar"], 14),
  P("jam", "Pantry", ["strawberry jam", "marmalade"], 45),
  P("ice cream", "Frozen", ["gelato", "ice lollies"], 21),
  P("frozen peas", "Frozen", ["peas", "garden peas", "petits pois"], 45),
  P("frozen berries", "Frozen", ["mixed berries", "frozen fruit"], 30),
  P("frozen pizza", "Frozen", ["pizza"], 21),
  P("hummus", "Dairy & Eggs", ["houmous", "humous"], 7),
];
