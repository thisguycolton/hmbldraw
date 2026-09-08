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

ActiveRecord::Schema[8.0].define(version: 2026_09_08_020159) do
  create_table "game_rooms", force: :cascade do |t|
    t.string "code"
    t.string "status"
    t.integer "current_round"
    t.integer "total_rounds"
    t.integer "round_duration"
    t.datetime "started_at"
    t.datetime "finished_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "game_number", default: 1, null: false
  end

  create_table "guesses", force: :cascade do |t|
    t.integer "round_id", null: false
    t.integer "player_id", null: false
    t.string "text"
    t.boolean "correct"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["player_id"], name: "index_guesses_on_player_id"
    t.index ["round_id"], name: "index_guesses_on_round_id"
  end

  create_table "players", force: :cascade do |t|
    t.integer "game_room_id", null: false
    t.string "name"
    t.integer "score"
    t.integer "position"
    t.boolean "connected"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "player_token_digest"
    t.string "connection_token"
    t.index ["connection_token"], name: "index_players_on_connection_token", unique: true
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
    t.bigint "drawer_id"
    t.string "word"
    t.string "status", default: "starting", null: false
    t.datetime "started_at"
    t.datetime "ended_at"
    t.bigint "winner_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.json "word_options", default: [], null: false
    t.integer "game_number", default: 1, null: false
    t.json "strokes", default: [], null: false
    t.index ["game_room_id", "game_number", "number"], name: "index_rounds_on_game_room_id_and_game_number_and_number", unique: true
    t.index ["game_room_id"], name: "index_rounds_on_game_room_id"
  end

  create_table "words", force: :cascade do |t|
    t.string "text"
    t.string "category"
    t.string "difficulty"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  add_foreign_key "guesses", "players"
  add_foreign_key "guesses", "rounds"
  add_foreign_key "players", "game_rooms"
  add_foreign_key "round_readies", "players"
  add_foreign_key "round_readies", "rounds"
  add_foreign_key "rounds", "game_rooms"
  add_foreign_key "rounds", "players", column: "drawer_id"
  add_foreign_key "rounds", "players", column: "winner_id"
end
