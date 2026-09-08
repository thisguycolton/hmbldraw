class CreateGameRooms < ActiveRecord::Migration[8.0]
  def change
    create_table :game_rooms do |t|
      t.string :code
      t.string :status
      t.integer :current_round
      t.integer :total_rounds
      t.integer :round_duration
      t.datetime :started_at
      t.datetime :finished_at

      t.timestamps
    end
  end
end
