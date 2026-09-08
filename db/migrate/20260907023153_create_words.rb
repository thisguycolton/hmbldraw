class CreateWords < ActiveRecord::Migration[8.0]
  def change
    create_table :words do |t|
      t.string :text
      t.string :category
      t.string :difficulty

      t.timestamps
    end
  end
end
