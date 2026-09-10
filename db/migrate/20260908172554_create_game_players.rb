class CreateGamePlayers < ActiveRecord::Migration[8.0]
  def change
    create_table :game_players do |t|
      t.references :game, null: false, foreign_key: true
      t.references :player, null: false, foreign_key: true

      # Snapshot of the player's name at the time of this game.
      t.string :name_snapshot, null: false

      # Score for THIS game.
      t.integer :score, null: false, default: 0

      # Position/order for THIS game.
      t.integer :position, null: false, default: 0

      t.datetime :joined_at
      t.datetime :left_at

      t.timestamps
    end

    add_index :game_players,
              [:game_id, :player_id],
              unique: true

    add_index :game_players,
              [:game_id, :position],
              unique: true
  end
end
