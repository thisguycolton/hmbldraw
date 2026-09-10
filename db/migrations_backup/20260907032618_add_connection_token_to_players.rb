class AddConnectionTokenToPlayers < ActiveRecord::Migration[8.0]
  def change
    add_column :players, :connection_token, :string
    add_index :players, :connection_token, unique: true
  end
end
