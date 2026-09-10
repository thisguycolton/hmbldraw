class AddStrokesToRounds < ActiveRecord::Migration[8.0]
  def change
    add_column :rounds, :strokes, :json
  end
end
