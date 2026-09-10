class Round < ApplicationRecord
  belongs_to :game_room

  has_many :round_readies, dependent: :destroy
  has_many :guesses, dependent: :destroy

  belongs_to :drawer,
             class_name: "Player",
             foreign_key: :drawer_id,
             optional: true

  belongs_to :winner,
             class_name: "Player",
             foreign_key: :winner_id,
             optional: true

  STATUSES = %w[
    starting
    drawing
    ended
  ].freeze

  validates :number,
            presence: true,
            numericality: {
              only_integer: true,
              greater_than: 0
            }

  validates :game_number,
            presence: true,
            numericality: {
              only_integer: true,
              greater_than: 0
            }

  validates :status,
            presence: true,
            inclusion: { in: STATUSES }

  validates :word,
            length: { minimum: 1 },
            allow_blank: true

  validates :number,
            uniqueness: {
              scope: [:game_room_id, :game_number]
            }

  validate :drawer_belongs_to_game_room
  validate :winner_belongs_to_game_room
  validate :word_required_when_drawing

  def game
    game_room.games.find_by(number: game_number)
  end

  private

  def drawer_belongs_to_game_room
    return unless drawer

    unless drawer.game_room_id == game_room_id
      errors.add(
        :drawer,
        "must belong to the game room"
      )
    end
  end

  def winner_belongs_to_game_room
    return unless winner

    unless winner.game_room_id == game_room_id
      errors.add(
        :winner,
        "must belong to the game room"
      )
    end
  end

  def word_required_when_drawing
    return unless status == "drawing"
    return if word.present?

    errors.add(
      :word,
      "can't be blank when drawing"
    )
  end
end
