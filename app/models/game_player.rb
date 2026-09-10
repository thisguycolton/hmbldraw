class GamePlayer < ApplicationRecord
  belongs_to :game
  belongs_to :player

  validates :name_snapshot,
            presence: true

  validates :score,
            numericality: {
              greater_than_or_equal_to: 0
            }

  validates :position,
            numericality: {
              only_integer: true,
              greater_than_or_equal_to: 0
            }

  validates :player_id,
            uniqueness: {
              scope: :game_id
            }

  validates :position,
            uniqueness: {
              scope: :game_id
            }

  validate :player_belongs_to_game_room

  private

  def player_belongs_to_game_room
    return unless game && player

    unless player.game_room_id == game.game_room_id
      errors.add(
        :player,
        "must belong to the game's game room"
      )
    end
  end
end
