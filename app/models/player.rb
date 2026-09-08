class Player < ApplicationRecord
  belongs_to :game_room
  has_many :guesses, dependent: :destroy
  has_many :round_readies, dependent: :destroy

  has_many :drawn_rounds,
           class_name: "Round",
           foreign_key: :drawer_id,
           dependent: :nullify

  has_many :won_rounds,
           class_name: "Round",
           foreign_key: :winner_id,
           dependent: :nullify

  validates :name, presence: true, length: { in: 1..24 }
  validates :score, numericality: { greater_than_or_equal_to: 0 }
  validates :position, numericality: {
    only_integer: true,
    greater_than_or_equal_to: 0
  }

  validates :game_room_id, uniqueness: { scope: :position }

  before_validation :normalize_name

  def generate_player_token!
    token = SecureRandom.urlsafe_base64(32)

    update!(
      player_token_digest: Digest::SHA256.hexdigest(token)
    )

    token
  end

  def self.find_by_player_token(token)
    return nil if token.blank?

    digest = Digest::SHA256.hexdigest(token)

    find_by(player_token_digest: digest)
  end

  def begin_connection!
    token = SecureRandom.urlsafe_base64(24)

    update!(
      connection_token: token,
      connected: true
    )

    token
  end

  def end_connection!(token)
    return unless connection_token == token

    update!(connected: false)
  end

  private

  def normalize_name
    self.name = name.to_s.strip
  end
end
