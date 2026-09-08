class RemoveOldRoundNumberIndex < ActiveRecord::Migration[8.0]
  def change
    remove_index :rounds,
                 name: "index_rounds_on_game_room_id_and_number"
  end
end
