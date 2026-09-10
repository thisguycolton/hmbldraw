class CreateGames < ActiveRecord::Migration[8.0]
  def change
    create_table :games do |t|
      t.references :game_room, null: false, foreign_key: true

      # Game 1, Game 2, Game 3...
      t.integer :number, null: false

      t.string :mode, null: false, default: "classic"

      t.string :status, null: false, default: "waiting"

      t.integer :current_round, null: false, default: 0

      # Classic uses these.
      # Endless can leave them NULL.
      t.integer :total_rounds
      t.integer :round_duration

      # NULL category means "All Categories".
      t.references :category, null: true, foreign_key: true

      t.datetime :started_at
      t.datetime :finished_at

      t.timestamps
    end

    add_index :games,
              [:game_room_id, :number],
              unique: true

    add_index :games, :status
    add_index :games, :mode
  end
end
