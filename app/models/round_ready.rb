class RoundReady < ApplicationRecord
  belongs_to :round
  belongs_to :player

  validates :player_id,
            uniqueness: {
              scope: :round_id
            }
end
