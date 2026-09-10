class Game < ApplicationRecord
  belongs_to :game_room
  belongs_to :category, optional: true

  has_many :game_players, dependent: :destroy
  has_many :players, through: :game_players

  STATUSES = %w[waiting active finished].freeze

  validates :status, inclusion: { in: STATUSES }

  MODES = %w[
    classic
    endless
  ].freeze

  validates :number,
            presence: true,
            numericality: {
              only_integer: true,
              greater_than: 0
            }

  validates :mode,
            presence: true,
            inclusion: { in: MODES }


  validates :current_round,
            numericality: {
              only_integer: true,
              greater_than_or_equal_to: 0
            }

  validates :total_rounds,
            numericality: {
              only_integer: true,
              greater_than: 0
            },
            allow_nil: true

  validates :round_duration,
            numericality: {
              only_integer: true,
              greater_than: 0
            },
            allow_nil: true

  validates :number,
            uniqueness: {
              scope: :game_room_id
            }

  # --------------------------------------------------------------------------
  # Transitional round relationship
  #
  # Rounds currently retain game_room_id + game_number so the existing
  # game engine/UI can continue working while we migrate it to Game.
  # --------------------------------------------------------------------------

  def rounds
    game_room.rounds.where(game_number: number)
  end

  def current_round_record
    rounds.find_by(number: current_round)
  end

  def endless?
    mode == "endless"
  end

  def classic?
    mode == "classic"
  end

  def finished?
    status == "finished"
  end
end
