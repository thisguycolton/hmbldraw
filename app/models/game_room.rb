class GameRoom < ApplicationRecord
  has_many :players, dependent: :destroy
  has_many :games, dependent: :destroy

  has_many :rounds, dependent: :destroy
  has_many :guesses, through: :rounds

  STATUSES = %w[
    waiting
    starting_round
    drawing
    round_end
    finished
  ].freeze

  MODES = %w[
    classic
    endless
  ].freeze

  validates :code,
            presence: true,
            uniqueness: true,
            length: { is: 4 },
            format: { with: /\A[A-Z0-9]+\z/ }

  validates :status,
            inclusion: { in: STATUSES }

  validates :mode,
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

  validates :game_number,
            numericality: {
              only_integer: true,
              greater_than: 0
            }

  validates :name,
            presence: true,
            length: { maximum: 100 }

  before_validation :normalize_code

  # --------------------------------------------------------------------------
  # Historical/current game
  # --------------------------------------------------------------------------

  def current_game
    games.order(number: :desc).first
  end

  def game_mode
    current_game&.mode || mode
  end

  private

  def normalize_code
    self.code = code.to_s.upcase
  end
end
