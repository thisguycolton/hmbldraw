class CreateRoundReadies < ActiveRecord::Migration[8.0]
  def change
    create_table :round_readies do |t|
      t.references :round, null: false, foreign_key: true
      t.references :player, null: false, foreign_key: true
      t.datetime :ready_at, null: false

      t.timestamps
    end

    add_index :round_readies,
              [:round_id, :player_id],
              unique: true
  end
end
