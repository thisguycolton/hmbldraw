class AddGameNumberToGameRooms < ActiveRecord::Migration[8.0]
  def change
    add_column :game_rooms, :game_number, :integer
  end
end
