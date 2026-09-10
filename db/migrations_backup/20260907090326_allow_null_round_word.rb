class AllowNullRoundWord < ActiveRecord::Migration[8.0]
  def change
    change_column_null :rounds, :word, true
  end
end
