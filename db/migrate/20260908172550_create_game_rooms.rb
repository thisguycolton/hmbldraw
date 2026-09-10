class CreateGameRooms < ActiveRecord::Migration[8.0]
  def change
    create_table :game_rooms do |t|
      t.string :code, null: false
      t.string :status, null: false, default: "waiting"

      # Current-game compatibility fields.
      # These remain here so the existing UI/game engine doesn't
      # have to change all at once.
      t.integer :current_round, null: false, default: 0
      t.integer :total_rounds
      t.integer :round_duration

      t.datetime :started_at
      t.datetime :finished_at

      # Historical game sequence within this room.
      t.integer :game_number, null: false, default: 1

      # Future-ready game mode.
      t.string :mode, null: false, default: "classic"

      # Useful for persistent Endless lobbies later.
      t.string :name, null: false, default: "HUMBLDRAW Room"

      t.timestamps
    end

    add_index :game_rooms, :code, unique: true
  end
end
