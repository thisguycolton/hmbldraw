class CreateGuesses < ActiveRecord::Migration[8.0]
  def change
    create_table :guesses do |t|
      t.references :round, null: false, foreign_key: true
      t.references :player, null: false, foreign_key: true

      t.string :text, null: false
      t.boolean :correct, null: false, default: false

      t.timestamps
    end

    add_index :guesses, [:round_id, :created_at]
    add_index :guesses, [:round_id, :correct]
  end
end
