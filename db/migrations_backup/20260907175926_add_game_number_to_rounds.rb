class AddGameNumberToRounds < ActiveRecord::Migration[8.0]
  def change
    add_column :rounds, :game_number, :integer, null: false, default: 1

    add_index :rounds, [:game_room_id, :game_number, :number], unique: true
  end
end
