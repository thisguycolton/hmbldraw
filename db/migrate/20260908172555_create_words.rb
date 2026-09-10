class CreateWords < ActiveRecord::Migration[8.0]
  def change
    create_table :words do |t|
      t.references :category, null: false, foreign_key: true

      t.string :text, null: false
      t.string :difficulty, null: false, default: "medium"

      t.boolean :active, null: false, default: true

      t.timestamps
    end

    add_index :words, [:category_id, :text], unique: true
    add_index :words, :active
    add_index :words, :difficulty
  end
end
