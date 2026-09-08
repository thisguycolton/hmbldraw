# # This file should ensure the existence of records required to run the application in every environment (production,
# # development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# # The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).
# #
# # Example:
# #
# #   ["Action", "Comedy", "Drama", "Horror"].each do |genre_name|
# #     MovieGenre.find_or_create_by!(name: genre_name)
# #   end
# # db/seeds.rb

# words = [
#   # Animals — Easy
#   { text: "cat", category: "Animals", difficulty: "easy" },
#   { text: "dog", category: "Animals", difficulty: "easy" },
#   { text: "fish", category: "Animals", difficulty: "easy" },
#   { text: "bird", category: "Animals", difficulty: "easy" },
#   { text: "horse", category: "Animals", difficulty: "easy" },
#   { text: "cow", category: "Animals", difficulty: "easy" },
#   { text: "pig", category: "Animals", difficulty: "easy" },
#   { text: "duck", category: "Animals", difficulty: "easy" },
#   { text: "frog", category: "Animals", difficulty: "easy" },
#   { text: "mouse", category: "Animals", difficulty: "easy" },

#   # Animals — Medium
#   { text: "elephant", category: "Animals", difficulty: "medium" },
#   { text: "giraffe", category: "Animals", difficulty: "medium" },
#   { text: "penguin", category: "Animals", difficulty: "medium" },
#   { text: "kangaroo", category: "Animals", difficulty: "medium" },
#   { text: "monkey", category: "Animals", difficulty: "medium" },
#   { text: "crocodile", category: "Animals", difficulty: "medium" },
#   { text: "dolphin", category: "Animals", difficulty: "medium" },
#   { text: "octopus", category: "Animals", difficulty: "medium" },
#   { text: "butterfly", category: "Animals", difficulty: "medium" },
#   { text: "turtle", category: "Animals", difficulty: "medium" },

#   # Animals — Hard
#   { text: "platypus", category: "Animals", difficulty: "hard" },
#   { text: "chameleon", category: "Animals", difficulty: "hard" },
#   { text: "flamingo", category: "Animals", difficulty: "hard" },
#   { text: "porcupine", category: "Animals", difficulty: "hard" },
#   { text: "seahorse", category: "Animals", difficulty: "hard" },

#   # Food — Easy
#   { text: "pizza", category: "Food", difficulty: "easy" },
#   { text: "hamburger", category: "Food", difficulty: "easy" },
#   { text: "apple", category: "Food", difficulty: "easy" },
#   { text: "banana", category: "Food", difficulty: "easy" },
#   { text: "cake", category: "Food", difficulty: "easy" },
#   { text: "cookie", category: "Food", difficulty: "easy" },
#   { text: "ice cream", category: "Food", difficulty: "easy" },
#   { text: "hot dog", category: "Food", difficulty: "easy" },
#   { text: "sandwich", category: "Food", difficulty: "easy" },
#   { text: "popcorn", category: "Food", difficulty: "easy" },

#   # Food — Medium
#   { text: "spaghetti", category: "Food", difficulty: "medium" },
#   { text: "taco", category: "Food", difficulty: "medium" },
#   { text: "pancakes", category: "Food", difficulty: "medium" },
#   { text: "sushi", category: "Food", difficulty: "medium" },
#   { text: "watermelon", category: "Food", difficulty: "medium" },
#   { text: "birthday cake", category: "Food", difficulty: "medium" },
#   { text: "ice cream cone", category: "Food", difficulty: "medium" },
#   { text: "french fries", category: "Food", difficulty: "medium" },
#   { text: "cupcake", category: "Food", difficulty: "medium" },
#   { text: "cheeseburger", category: "Food", difficulty: "medium" },

#   # Objects — Easy
#   { text: "chair", category: "Objects", difficulty: "easy" },
#   { text: "table", category: "Objects", difficulty: "easy" },
#   { text: "book", category: "Objects", difficulty: "easy" },
#   { text: "pencil", category: "Objects", difficulty: "easy" },
#   { text: "phone", category: "Objects", difficulty: "easy" },
#   { text: "key", category: "Objects", difficulty: "easy" },
#   { text: "ball", category: "Objects", difficulty: "easy" },
#   { text: "door", category: "Objects", difficulty: "easy" },
#   { text: "clock", category: "Objects", difficulty: "easy" },
#   { text: "lamp", category: "Objects", difficulty: "easy" },

#   # Objects — Medium
#   { text: "umbrella", category: "Objects", difficulty: "medium" },
#   { text: "toaster", category: "Objects", difficulty: "medium" },
#   { text: "backpack", category: "Objects", difficulty: "medium" },
#   { text: "bicycle", category: "Objects", difficulty: "medium" },
#   { text: "camera", category: "Objects", difficulty: "medium" },
#   { text: "television", category: "Objects", difficulty: "medium" },
#   { text: "refrigerator", category: "Objects", difficulty: "medium" },
#   { text: "vacuum cleaner", category: "Objects", difficulty: "medium" },
#   { text: "skateboard", category: "Objects", difficulty: "medium" },
#   { text: "suitcase", category: "Objects", difficulty: "medium" },

#   # Objects — Hard
#   { text: "telescope", category: "Objects", difficulty: "hard" },
#   { text: "typewriter", category: "Objects", difficulty: "hard" },
#   { text: "hourglass", category: "Objects", difficulty: "hard" },
#   { text: "compass", category: "Objects", difficulty: "hard" },
#   { text: "microscope", category: "Objects", difficulty: "hard" },

#   # Places — Easy
#   { text: "house", category: "Places", difficulty: "easy" },
#   { text: "school", category: "Places", difficulty: "easy" },
#   { text: "park", category: "Places", difficulty: "easy" },
#   { text: "beach", category: "Places", difficulty: "easy" },
#   { text: "store", category: "Places", difficulty: "easy" },
#   { text: "hospital", category: "Places", difficulty: "easy" },
#   { text: "restaurant", category: "Places", difficulty: "easy" },
#   { text: "library", category: "Places", difficulty: "easy" },
#   { text: "airport", category: "Places", difficulty: "easy" },
#   { text: "farm", category: "Places", difficulty: "easy" },

#   # Places — Medium
#   { text: "castle", category: "Places", difficulty: "medium" },
#   { text: "lighthouse", category: "Places", difficulty: "medium" },
#   { text: "campground", category: "Places", difficulty: "medium" },
#   { text: "fire station", category: "Places", difficulty: "medium" },
#   { text: "movie theater", category: "Places", difficulty: "medium" },
#   { text: "gas station", category: "Places", difficulty: "medium" },
#   { text: "train station", category: "Places", difficulty: "medium" },
#   { text: "amusement park", category: "Places", difficulty: "medium" },
#   { text: "grocery store", category: "Places", difficulty: "medium" },
#   { text: "coffee shop", category: "Places", difficulty: "medium" },

#   # Nature — Easy
#   { text: "sun", category: "Nature", difficulty: "easy" },
#   { text: "moon", category: "Nature", difficulty: "easy" },
#   { text: "star", category: "Nature", difficulty: "easy" },
#   { text: "cloud", category: "Nature", difficulty: "easy" },
#   { text: "tree", category: "Nature", difficulty: "easy" },
#   { text: "flower", category: "Nature", difficulty: "easy" },
#   { text: "mountain", category: "Nature", difficulty: "easy" },
#   { text: "river", category: "Nature", difficulty: "easy" },
#   { text: "rain", category: "Nature", difficulty: "easy" },
#   { text: "snow", category: "Nature", difficulty: "easy" },

#   # Nature — Medium
#   { text: "volcano", category: "Nature", difficulty: "medium" },
#   { text: "waterfall", category: "Nature", difficulty: "medium" },
#   { text: "rainbow", category: "Nature", difficulty: "medium" },
#   { text: "tornado", category: "Nature", difficulty: "medium" },
#   { text: "desert", category: "Nature", difficulty: "medium" },
#   { text: "island", category: "Nature", difficulty: "medium" },
#   { text: "forest", category: "Nature", difficulty: "medium" },
#   { text: "cactus", category: "Nature", difficulty: "medium" },
#   { text: "lightning", category: "Nature", difficulty: "medium" },
#   { text: "campfire", category: "Nature", difficulty: "medium" },

#   # Actions — Easy
#   { text: "running", category: "Actions", difficulty: "easy" },
#   { text: "walking", category: "Actions", difficulty: "easy" },
#   { text: "jumping", category: "Actions", difficulty: "easy" },
#   { text: "sleeping", category: "Actions", difficulty: "easy" },
#   { text: "eating", category: "Actions", difficulty: "easy" },
#   { text: "drinking", category: "Actions", difficulty: "easy" },
#   { text: "dancing", category: "Actions", difficulty: "easy" },
#   { text: "swimming", category: "Actions", difficulty: "easy" },
#   { text: "singing", category: "Actions", difficulty: "easy" },
#   { text: "crying", category: "Actions", difficulty: "easy" },

#   # Actions — Medium
#   { text: "cooking", category: "Actions", difficulty: "medium" },
#   { text: "fishing", category: "Actions", difficulty: "medium" },
#   { text: "skiing", category: "Actions", difficulty: "medium" },
#   { text: "surfing", category: "Actions", difficulty: "medium" },
#   { text: "painting", category: "Actions", difficulty: "medium" },
#   { text: "gardening", category: "Actions", difficulty: "medium" },
#   { text: "photographing", category: "Actions", difficulty: "medium" },
#   { text: "shoveling", category: "Actions", difficulty: "medium" },
#   { text: "climbing", category: "Actions", difficulty: "medium" },
#   { text: "juggling", category: "Actions", difficulty: "medium" },

#   # Professions — Medium
#   { text: "doctor", category: "Professions", difficulty: "medium" },
#   { text: "firefighter", category: "Professions", difficulty: "medium" },
#   { text: "police officer", category: "Professions", difficulty: "medium" },
#   { text: "chef", category: "Professions", difficulty: "medium" },
#   { text: "teacher", category: "Professions", difficulty: "medium" },
#   { text: "pilot", category: "Professions", difficulty: "medium" },
#   { text: "astronaut", category: "Professions", difficulty: "medium" },
#   { text: "detective", category: "Professions", difficulty: "medium" },
#   { text: "construction worker", category: "Professions", difficulty: "medium" },
#   { text: "photographer", category: "Professions", difficulty: "medium" },

#   # Transportation — Easy
#   { text: "car", category: "Transportation", difficulty: "easy" },
#   { text: "bus", category: "Transportation", difficulty: "easy" },
#   { text: "train", category: "Transportation", difficulty: "easy" },
#   { text: "boat", category: "Transportation", difficulty: "easy" },
#   { text: "airplane", category: "Transportation", difficulty: "easy" },
#   { text: "truck", category: "Transportation", difficulty: "easy" },
#   { text: "bike", category: "Transportation", difficulty: "easy" },
#   { text: "rocket", category: "Transportation", difficulty: "easy" },
#   { text: "taxi", category: "Transportation", difficulty: "easy" },
#   { text: "helicopter", category: "Transportation", difficulty: "easy" },

#   # Transportation — Medium
#   { text: "submarine", category: "Transportation", difficulty: "medium" },
#   { text: "motorcycle", category: "Transportation", difficulty: "medium" },
#   { text: "sailboat", category: "Transportation", difficulty: "medium" },
#   { text: "hot air balloon", category: "Transportation", difficulty: "medium" },
#   { text: "roller skates", category: "Transportation", difficulty: "medium" },

#   # Sports — Easy
#   { text: "football", category: "Sports", difficulty: "easy" },
#   { text: "basketball", category: "Sports", difficulty: "easy" },
#   { text: "baseball", category: "Sports", difficulty: "easy" },
#   { text: "soccer", category: "Sports", difficulty: "easy" },
#   { text: "tennis", category: "Sports", difficulty: "easy" },
#   { text: "golf", category: "Sports", difficulty: "easy" },
#   { text: "bowling", category: "Sports", difficulty: "easy" },
#   { text: "skateboarding", category: "Sports", difficulty: "easy" },
#   { text: "boxing", category: "Sports", difficulty: "easy" },
#   { text: "skiing", category: "Sports", difficulty: "easy" },

#   # Sports — Medium
#   { text: "surfing", category: "Sports", difficulty: "medium" },
#   { text: "ice skating", category: "Sports", difficulty: "medium" },
#   { text: "rock climbing", category: "Sports", difficulty: "medium" },
#   { text: "horse racing", category: "Sports", difficulty: "medium" },
#   { text: "archery", category: "Sports", difficulty: "medium" },

#   # Fantasy / Fun — Medium
#   { text: "dragon", category: "Fantasy", difficulty: "medium" },
#   { text: "unicorn", category: "Fantasy", difficulty: "medium" },
#   { text: "mermaid", category: "Fantasy", difficulty: "medium" },
#   { text: "pirate", category: "Fantasy", difficulty: "medium" },
#   { text: "wizard", category: "Fantasy", difficulty: "medium" },
#   { text: "ghost", category: "Fantasy", difficulty: "medium" },
#   { text: "robot", category: "Fantasy", difficulty: "medium" },
#   { text: "alien", category: "Fantasy", difficulty: "medium" },
#   { text: "superhero", category: "Fantasy", difficulty: "medium" },
#   { text: "monster", category: "Fantasy", difficulty: "medium" },

#   # Fantasy / Fun — Hard
#   { text: "time machine", category: "Fantasy", difficulty: "hard" },
#   { text: "invisible man", category: "Fantasy", difficulty: "hard" },
#   { text: "magic carpet", category: "Fantasy", difficulty: "hard" },
#   { text: "haunted house", category: "Fantasy", difficulty: "hard" },
#   { text: "treasure map", category: "Fantasy", difficulty: "hard" }
# ]

# words.each do |word|
#   Word.find_or_create_by!(text: word[:text]) do |record|
#     record.category = word[:category]
#     record.difficulty = word[:difficulty]
#   end
# end

# puts "Seeded #{Word.count} words."

# --------------------------------------------------------------------------
# Demo Game Room
# --------------------------------------------------------------------------

demo_room = GameRoom.find_or_create_by!(code: "DEMO") do |room|
  room.status = "waiting"
  room.current_round = 0
  room.total_rounds = 5
  room.round_duration = 60
end

demo_players = [
  { name: "Colton", position: 0 },
  { name: "Alex",   position: 1 },
  { name: "Sam",    position: 2 },
  { name: "Jess",   position: 3 }
]

demo_players.each do |player|
  demo_room.players.find_or_create_by!(position: player[:position]) do |record|
    record.name = player[:name]
    record.score = 0
    record.connected = true
  end
end

puts "Demo room: #{demo_room.code}"
puts "Players: #{demo_room.players.order(:position).pluck(:name).join(', ')}"
