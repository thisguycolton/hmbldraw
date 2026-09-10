class CreateRounds < ActiveRecord::Migration[8.0]
  def change
    create_table :rounds do |t|
      t.references :game_room, null: false, foreign_key: true

      # Round number within the game.
      t.integer :number, null: false

      # Identifies which historical game this round belongs to.
      t.integer :game_number, null: false, default: 1

      t.bigint :drawer_id
      t.bigint :winner_id

      # Snapshot of the selected word.
      # We keep the text so historical rounds remain readable even
      # if the Word record changes later.
      t.string :word

      t.string :status, null: false, default: "starting"

      # Current UI expects these to be arrays.
      t.json :word_options, null: false, default: []
      t.json :strokes, null: false, default: []

      t.datetime :started_at
      t.datetime :ended_at

      # Persist scoring decisions for historical review.
      t.integer :guesser_points
      t.integer :drawer_points

      t.timestamps
    end

    add_index :rounds,
              [:game_room_id, :game_number, :number],
              unique: true

    add_index :rounds, :drawer_id
    add_index :rounds, :winner_id

    add_foreign_key :rounds,
                    :players,
                    column: :drawer_id

    add_foreign_key :rounds,
                    :players,
                    column: :winner_id
  end
end
