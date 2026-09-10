class Guess < ApplicationRecord
  belongs_to :round
  belongs_to :player

  validates :text,
            presence: true

  validates :correct,
            inclusion: { in: [true, false] }
end
