class CreatePlayers < ActiveRecord::Migration[8.0]
  def change
    create_table :players do |t|
      t.references :game_room, null: false, foreign_key: true

      t.string :name, null: false

      # Current-game score.
      # GamePlayer will preserve historical scores.
      t.integer :score, null: false, default: 0

      t.integer :position, null: false, default: 0

      t.boolean :connected, null: false, default: false

      t.string :player_token_digest
      t.string :connection_token

      t.datetime :joined_at
      t.datetime :last_seen_at

      t.timestamps
    end

    add_index :players, :player_token_digest, unique: true
    add_index :players, :connection_token, unique: true
    add_index :players, [:game_room_id, :position]
  end
end
