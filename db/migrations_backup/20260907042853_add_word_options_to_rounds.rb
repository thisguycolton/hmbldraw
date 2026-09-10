class AddWordOptionsToRounds < ActiveRecord::Migration[8.0]
  def change
    add_column :rounds, :word_options, :json, null: false, default: []
  end
end
