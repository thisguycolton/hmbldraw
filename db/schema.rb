# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_09_10_003720) do
  create_table "categories", force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.text "description"
    t.boolean "active", default: true, null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_categories_on_active"
    t.index ["position"], name: "index_categories_on_position"
    t.index ["slug"], name: "index_categories_on_slug", unique: true
  end

  create_table "game_players", force: :cascade do |t|
    t.integer "game_id", null: false
    t.integer "player_id", null: false
    t.string "name_snapshot", null: false
    t.integer "score", default: 0, null: false
    t.integer "position", default: 0, null: false
    t.datetime "joined_at"
    t.datetime "left_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["game_id", "player_id"], name: "index_game_players_on_game_id_and_player_id", unique: true
    t.index ["game_id", "position"], name: "index_game_players_on_game_id_and_position", unique: true
    t.index ["game_id"], name: "index_game_players_on_game_id"
    t.index ["player_id"], name: "index_game_players_on_player_id"
  end

  create_table "game_rooms", force: :cascade do |t|
    t.string "code", null: false
    t.string "status", default: "waiting", null: false
    t.integer "current_round", default: 0, null: false
    t.integer "total_rounds"
    t.integer "round_duration"
    t.datetime "started_at"
    t.datetime "finished_at"
    t.integer "game_number", default: 1, null: false
    t.string "mode", default: "classic", null: false
    t.string "name", default: "HUMBLDRAW Room", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_game_rooms_on_code", unique: true
  end

  create_table "games", force: :cascade do |t|
    t.integer "game_room_id", null: false
    t.integer "number", null: false
    t.string "mode", default: "classic", null: false
    t.string "status", default: "waiting", null: false
    t.integer "current_round", default: 0, null: false
    t.integer "total_rounds"
    t.integer "round_duration"
    t.integer "category_id"
    t.datetime "started_at"
    t.datetime "finished_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "difficulty", default: 2, null: false
    t.index ["category_id"], name: "index_games_on_category_id"
    t.index ["game_room_id", "number"], name: "index_games_on_game_room_id_and_number", unique: true
    t.index ["game_room_id"], name: "index_games_on_game_room_id"
    t.index ["mode"], name: "index_games_on_mode"
    t.index ["status"], name: "index_games_on_status"
  end

  create_table "guesses", force: :cascade do |t|
    t.integer "round_id", null: false
    t.integer "player_id", null: false
    t.string "text", null: false
    t.boolean "correct", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["player_id"], name: "index_guesses_on_player_id"
    t.index ["round_id", "correct"], name: "index_guesses_on_round_id_and_correct"
    t.index ["round_id", "created_at"], name: "index_guesses_on_round_id_and_created_at"
    t.index ["round_id"], name: "index_guesses_on_round_id"
  end

  create_table "players", force: :cascade do |t|
    t.integer "game_room_id", null: false
    t.string "name", null: false
    t.integer "score", default: 0, null: false
    t.integer "position", default: 0, null: false
    t.boolean "connected", default: false, null: false
    t.string "player_token_digest"
    t.string "connection_token"
    t.datetime "joined_at"
    t.datetime "last_seen_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["connection_token"], name: "index_players_on_connection_token", unique: true
    t.index ["game_room_id", "position"], name: "index_players_on_game_room_id_and_position"
    t.index ["game_room_id"], name: "index_players_on_game_room_id"
    t.index ["player_token_digest"], name: "index_players_on_player_token_digest", unique: true
  end

  create_table "round_readies", force: :cascade do |t|
    t.integer "round_id", null: false
    t.integer "player_id", null: false
    t.datetime "ready_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["player_id"], name: "index_round_readies_on_player_id"
    t.index ["round_id", "player_id"], name: "index_round_readies_on_round_id_and_player_id", unique: true
    t.index ["round_id"], name: "index_round_readies_on_round_id"
  end

  create_table "rounds", force: :cascade do |t|
    t.integer "game_room_id", null: false
    t.integer "number", null: false
    t.integer "game_number", default: 1, null: false
    t.bigint "drawer_id"
    t.bigint "winner_id"
    t.string "word"
    t.string "status", default: "starting", null: false
    t.json "word_options", default: [], null: false
    t.json "strokes", default: [], null: false
    t.datetime "started_at"
    t.datetime "ended_at"
    t.integer "guesser_points"
    t.integer "drawer_points"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["drawer_id"], name: "index_rounds_on_drawer_id"
    t.index ["game_room_id", "game_number", "number"], name: "index_rounds_on_game_room_id_and_game_number_and_number", unique: true
    t.index ["game_room_id"], name: "index_rounds_on_game_room_id"
    t.index ["winner_id"], name: "index_rounds_on_winner_id"
  end

  create_table "words", force: :cascade do |t|
    t.integer "category_id", null: false
    t.string "text", null: false
    t.string "difficulty", default: "medium", null: false
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_words_on_active"
    t.index ["category_id", "text"], name: "index_words_on_category_id_and_text", unique: true
    t.index ["category_id"], name: "index_words_on_category_id"
    t.index ["difficulty"], name: "index_words_on_difficulty"
  end

  add_foreign_key "game_players", "games"
  add_foreign_key "game_players", "players"
  add_foreign_key "games", "categories"
  add_foreign_key "games", "game_rooms"
  add_foreign_key "guesses", "players"
  add_foreign_key "guesses", "rounds"
  add_foreign_key "players", "game_rooms"
  add_foreign_key "round_readies", "players"
  add_foreign_key "round_readies", "rounds"
  add_foreign_key "rounds", "game_rooms"
  add_foreign_key "rounds", "players", column: "drawer_id"
  add_foreign_key "rounds", "players", column: "winner_id"
  add_foreign_key "words", "categories"
end
