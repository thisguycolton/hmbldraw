class GameRoom < ApplicationRecord
  has_many :players, dependent: :destroy
  has_many :rounds, dependent: :destroy

  has_many :guesses, through: :rounds

  STATUSES = %w[waiting starting_round drawing round_end finished].freeze

  validates :code,
            presence: true,
            uniqueness: true,
            length: { is: 4 },
            format: { with: /\A[A-Z0-9]+\z/ }

  validates :status, inclusion: { in: STATUSES }
  validates :current_round, numericality: { greater_than_or_equal_to: 0 }
  validates :total_rounds, numericality: { greater_than: 0 }
  validates :round_duration, numericality: { greater_than: 0 }

  before_validation :normalize_code

  private

  def normalize_code
    self.code = code.to_s.upcase
  end
end
