class FixGameNumberOnGameRooms < ActiveRecord::Migration[8.0]
  def change
    change_column_default :game_rooms, :game_number, from: nil, to: 1

    change_column_null :game_rooms, :game_number, false, 1
  end
end
