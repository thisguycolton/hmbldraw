# # This file should ensure the existence of records required to run the application in every environment (production,
# # development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# # The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).
# #
# # Example:
# #
# #   ["Action", "Comedy", "Drama", "Horror"].each do |genre_name|
# #     MovieGenre.find_or_create_by!(name: genre_name)
# #   end
# db/seeds.rb

# ============================================================================
# HUMBLDRAW SEEDS
# ============================================================================
#
# Difficulty:
#   1 = Easy
#   2 = Medium
#   3 = Hard
#
# Difficulty is based primarily on how easy the word is to communicate
# visually in a Pictionary-style game.
# ============================================================================

CATEGORY_DEFINITIONS = [
  {
    name: "Animals",
    slug: "animals",
    description: "Animals, insects, and creatures."
  },
  {
    name: "Food & Drink",
    slug: "food-drink",
    description: "Food, meals, snacks, desserts, and drinks."
  },
  {
    name: "Objects",
    slug: "objects",
    description: "Everyday objects, tools, and things."
  },
  {
    name: "Places",
    slug: "places",
    description: "Buildings, landmarks, locations, and places."
  },
  {
    name: "Sports",
    slug: "sports",
    description: "Sports, equipment, and sporting activities."
  },
  {
    name: "Nature",
    slug: "nature",
    description: "Plants, weather, landscapes, and natural things."
  },
  {
    name: "Music",
    slug: "music",
    description: "Musical instruments, music concepts, and performers."
  },
  {
    name: "Games",
    slug: "games",
    description: "Games, toys, and gaming concepts."
  },
  {
    name: "Sobriety",
    slug: "sobriety",
    description: "Recovery, sobriety, and the journey of living one day at a time."
  },
  {
    name: "Random",
    slug: "random",
    description: "A random mix of words from the standard categories."
  }
]

CATEGORY_DEFINITIONS.each_with_index do |definition, index|
  Category.find_or_initialize_by(slug: definition[:slug]).tap do |category|
    category.name = definition[:name]
    category.description = definition[:description]
    category.position = index
    category.active = true
    category.save!
  end
end

def seed_words(category_slug, easy:, medium:, hard:)
  category = Category.find_by!(slug: category_slug)

  words = [
    *easy.map { |text| [text, 1] },
    *medium.map { |text| [text, 2] },
    *hard.map { |text| [text, 3] }
  ]

  words.each do |text, difficulty|
    Word.find_or_initialize_by(
      category: category,
      text: text
    ).tap do |word|
      word.difficulty = difficulty
      word.active = true
      word.save!
    end
  end

  puts "#{category.name}: #{words.length} words"
end


# ============================================================================
# ANIMALS
# ============================================================================

seed_words(
  "animals",

  easy: [
    "Cat",
    "Dog",
    "Fish",
    "Bird",
    "Horse",
    "Cow",
    "Pig",
    "Duck",
    "Frog",
    "Mouse",
    "Rabbit",
    "Snake",
    "Turtle",
    "Shark",
    "Whale",
    "Lion",
    "Tiger",
    "Bear",
    "Monkey",
    "Elephant"
  ],

  medium: [
    "Giraffe",
    "Zebra",
    "Penguin",
    "Dolphin",
    "Octopus",
    "Crocodile",
    "Kangaroo",
    "Gorilla",
    "Panda",
    "Flamingo",
    "Owl",
    "Eagle",
    "Parrot",
    "Peacock",
    "Hedgehog",
    "Squirrel",
    "Raccoon",
    "Skunk",
    "Deer",
    "Fox"
  ],

  hard: [
    "Chameleon",
    "Jellyfish",
    "Seahorse",
    "Platypus",
    "Armadillo",
    "Porcupine",
    "Sloth",
    "Anteater",
    "Walrus",
    "Narwhal"
  ]
)


# ============================================================================
# FOOD & DRINK
# ============================================================================

seed_words(
  "food-drink",

  easy: [
    "Pizza",
    "Burger",
    "Apple",
    "Banana",
    "Cake",
    "Cookie",
    "Donut",
    "Ice Cream",
    "Hot Dog",
    "Taco",
    "Egg",
    "Bread",
    "Cheese",
    "Carrot",
    "Corn",
    "Watermelon",
    "Cupcake",
    "Popcorn",
    "Pancake",
    "French Fries"
  ],

  medium: [
    "Spaghetti",
    "Sushi",
    "Sandwich",
    "Pineapple",
    "Strawberry",
    "Water Bottle",
    "Milkshake",
    "Lemonade",
    "Pretzel",
    "Burrito",
    "Nachos",
    "Waffle",
    "Popsicle",
    "Soup",
    "Steak",
    "Turkey",
    "Coffee",
    "Tea",
    "Birthday Cake",
    "Chocolate Bar"
  ],

  hard: [
    "Fortune Cookie",
    "Layer Cake",
    "Chocolate Fountain",
    "Peanut Butter",
    "Grilled Cheese",
    "Spaghetti and Meatballs",
    "Pancake Stack",
    "Ice Cream Sundae",
    "Fruit Smoothie",
    "Charcuterie Board"
  ]
)


# ============================================================================
# OBJECTS
# ============================================================================

seed_words(
  "objects",

  easy: [
    "Chair",
    "Table",
    "Cup",
    "Spoon",
    "Fork",
    "Plate",
    "Book",
    "Phone",
    "Key",
    "Clock",
    "Ball",
    "Lamp",
    "Bed",
    "Door",
    "Window",
    "Hat",
    "Shoe",
    "Umbrella",
    "Backpack",
    "Bottle"
  ],

  medium: [
    "Scissors",
    "Hammer",
    "Ladder",
    "Bicycle",
    "Guitar",
    "Camera",
    "Television",
    "Computer",
    "Toothbrush",
    "Flashlight",
    "Telescope",
    "Microscope",
    "Wheelbarrow",
    "Shopping Cart",
    "Mailbox",
    "Suitcase",
    "Skateboard",
    "Headphones",
    "Vacuum Cleaner",
    "Alarm Clock"
  ],

  hard: [
    "Compass",
    "Hourglass",
    "Typewriter",
    "Trophy",
    "Windmill",
    "Treasure Chest",
    "Toolbox",
    "Record Player",
    "Magnifying Glass",
    "Rubik's Cube"
  ]
)


# ============================================================================
# PLACES
# ============================================================================

seed_words(
  "places",

  easy: [
    "House",
    "School",
    "Park",
    "Beach",
    "Store",
    "Church",
    "Hospital",
    "Library",
    "Farm",
    "Zoo",
    "Castle",
    "Airport",
    "Restaurant",
    "Hotel",
    "Garage",
    "Pool",
    "Playground",
    "Garden",
    "Office",
    "Museum"
  ],

  medium: [
    "Fire Station",
    "Police Station",
    "Gas Station",
    "Movie Theater",
    "Train Station",
    "Supermarket",
    "Amusement Park",
    "Water Park",
    "Camping Ground",
    "Skyscraper",
    "Lighthouse",
    "Stadium",
    "Bakery",
    "Coffee Shop",
    "Bowling Alley",
    "Bus Stop",
    "Car Wash",
    "Construction Site",
    "Doctor's Office",
    "Dentist's Office"
  ],

  hard: [
    "Haunted House",
    "Space Station",
    "Medieval Castle",
    "Underground Cave",
    "Desert Oasis",
    "Mountain Village",
    "Fishing Pier",
    "Ski Resort",
    "Botanical Garden",
    "Ancient Ruins"
  ]
)


# ============================================================================
# SPORTS
# ============================================================================

seed_words(
  "sports",

  easy: [
    "Football",
    "Basketball",
    "Baseball",
    "Soccer",
    "Tennis",
    "Golf",
    "Hockey",
    "Boxing",
    "Swimming",
    "Running",
    "Bowling",
    "Volleyball",
    "Skateboarding",
    "Surfing",
    "Skiing",
    "Bicycle",
    "Baseball Bat",
    "Football Helmet",
    "Soccer Ball",
    "Basketball Hoop"
  ],

  medium: [
    "Tennis Racket",
    "Golf Club",
    "Hockey Stick",
    "Boxing Gloves",
    "Swimming Pool",
    "Gymnastics",
    "Snowboarding",
    "Rock Climbing",
    "Horse Racing",
    "Archery",
    "Wrestling",
    "Fencing",
    "Ice Skating",
    "Table Tennis",
    "Mini Golf",
    "Fishing",
    "Diving",
    "Marathon",
    "Relay Race",
    "Skate Park"
  ],

  hard: [
    "Figure Skating",
    "Pole Vault",
    "Shot Put",
    "High Jump",
    "Javelin Throw",
    "Bobsled",
    "Curling",
    "Water Polo",
    "Synchronized Swimming",
    "Obstacle Course"
  ]
)


# ============================================================================
# NATURE
# ============================================================================

seed_words(
  "nature",

  easy: [
    "Tree",
    "Flower",
    "Sun",
    "Moon",
    "Star",
    "Cloud",
    "Rain",
    "Snow",
    "Mountain",
    "River",
    "Lake",
    "Ocean",
    "Rock",
    "Leaf",
    "Grass",
    "Rainbow",
    "Volcano",
    "Fire",
    "Cactus",
    "Palm Tree"
  ],

  medium: [
    "Waterfall",
    "Lightning",
    "Thunderstorm",
    "Sunset",
    "Sunrise",
    "Forest",
    "Desert",
    "Island",
    "Glacier",
    "Cave",
    "Beach",
    "Tornado",
    "Hurricane",
    "Campfire",
    "Mushroom",
    "Pine Tree",
    "Rose",
    "Sunflower",
    "Bamboo",
    "Coral Reef"
  ],

  hard: [
    "Northern Lights",
    "Eclipse",
    "Avalanche",
    "Geyser",
    "Tidal Wave",
    "Meteor Shower",
    "Drought",
    "Earthquake",
    "Rainforest",
    "Fossil"
  ]
)


# ============================================================================
# MUSIC
# ============================================================================

seed_words(
  "music",

  easy: [
    "Guitar",
    "Piano",
    "Drum",
    "Trumpet",
    "Violin",
    "Flute",
    "Microphone",
    "Singer",
    "Headphones",
    "Speaker",
    "Music Note",
    "Record",
    "Radio",
    "Banjo",
    "Harp",
    "Saxophone",
    "Tambourine",
    "Bell",
    "Keyboard",
    "Concert"
  ],

  medium: [
    "Drum Set",
    "Electric Guitar",
    "Cello",
    "Accordion",
    "Harmonica",
    "Clarinet",
    "Trombone",
    "DJ",
    "Rock Band",
    "Choir",
    "Conductor",
    "Stage",
    "Vinyl Record",
    "Piano Keys",
    "Music Stand",
    "Guitar Pick",
    "Record Player",
    "Concert Ticket",
    "Karaoke",
    "Marching Band"
  ],

  hard: [
    "Orchestra",
    "Symphony",
    "Music Festival",
    "Opera Singer",
    "Rock Concert",
    "Disc Jockey",
    "Musical Notes",
    "Sound Wave",
    "Sheet Music",
    "Metronome"
  ]
)


# ============================================================================
# GAMES
# ============================================================================

seed_words(
  "games",

  easy: [
    "Chess",
    "Checkers",
    "Cards",
    "Dice",
    "Puzzle",
    "Balloon",
    "Kite",
    "Dart",
    "Toy Car",
    "Yo-Yo",
    "Teddy Bear",
    "Robot",
    "Doll",
    "Marbles",
    "Dominoes",
    "Jump Rope",
    "Board Game",
    "Video Game",
    "Controller",
    "Game Piece"
  ],

  medium: [
    "Jigsaw Puzzle",
    "Rubik's Cube",
    "Pinball",
    "Arcade Machine",
    "Slot Machine",
    "Treasure Hunt",
    "Hide and Seek",
    "Musical Chairs",
    "Tag",
    "Simon Says",
    "Rock Paper Scissors",
    "Connect Four",
    "Monopoly",
    "Scrabble",
    "Clue",
    "Battleship",
    "Game Show",
    "Roller Coaster",
    "Carnival",
    "Laser Tag"
  ],

  hard: [
    "Escape Room",
    "Scavenger Hunt",
    "Dungeons and Dragons",
    "Video Game Boss",
    "Treasure Map",
    "Obstacle Course",
    "Arcade Cabinet",
    "Board Game Night",
    "Virtual Reality",
    "Game Controller"
  ]
)

seed_words(
  "sobriety",
    easy: [
      "Coffee",
      "Chair",
      "Book",
      "Key",
      "Clock",
      "Coin",
      "Cup",
      "Phone",
      "Door",
      "Table",
      "Calendar",
      "Bottle",
      "Circle",
      "Hand",
      "Heart",
      "Star",
      "Sunrise",
      "Road",
      "Bridge",
      "Home"
    ],
    medium: [
      "Meeting",
      "Sponsor",
      "Handshake",
      "Group",
      "Recovery",
      "Journal",
      "Prayer",
      "Meditation",
      "Serenity",
      "Step",
      "Tradition",
      "Anniversary",
      "Sobriety Chip",
      "Meeting Chair",
      "Coffee Pot",
      "Big Book",
      "Open Door",
      "Helping Hand",
      "One Day at a Time",
      "Starting Over"
    ],
    hard: [
      "Higher Power",
      "Letting Go",
      "Making Amends",
      "Character Defect",
      "Fear",
      "Resentment",
      "Acceptance",
      "Gratitude",
      "Humility",
      "Honesty"
    ]
)


# ============================================================================
# SUMMARY
# ============================================================================

puts
puts "============================================"
puts "HUMBLDRAW seed complete"
puts "============================================"

Category.order(:position).each do |category|
  puts format(
    "%-20s %3d words",
    category.name,
    category.words.count
  )
end

puts "--------------------------------------------"
puts format("%-20s %3d words", "TOTAL", Word.count)
puts "============================================"
