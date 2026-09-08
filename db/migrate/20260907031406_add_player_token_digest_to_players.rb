class AddPlayerTokenDigestToPlayers < ActiveRecord::Migration[8.0]
  def change
    add_column :players, :player_token_digest, :string
    add_index :players, :player_token_digest, unique: true
  end
end
