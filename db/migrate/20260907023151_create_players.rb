class CreatePlayers < ActiveRecord::Migration[8.0]
  def change
    create_table :players do |t|
      t.references :game_room, null: false, foreign_key: true
      t.string :name
      t.integer :score
      t.integer :position
      t.boolean :connected

      t.timestamps
    end
  end
end
