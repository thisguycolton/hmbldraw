class CreateRounds < ActiveRecord::Migration[8.0]
  def change
    create_table :rounds do |t|
      t.references :game_room, null: false, foreign_key: true

      t.integer :number, null: false
      t.bigint :drawer_id
      t.string :word, null: false
      t.string :status, null: false, default: "starting"
      t.datetime :started_at
      t.datetime :ended_at
      t.bigint :winner_id

      t.timestamps
    end

    add_foreign_key :rounds, :players, column: :drawer_id
    add_foreign_key :rounds, :players, column: :winner_id

    add_index :rounds, [:game_room_id, :number], unique: true
  end
end
