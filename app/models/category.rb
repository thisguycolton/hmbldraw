class Category < ApplicationRecord
  has_many :words, dependent: :restrict_with_error
  has_many :games, dependent: :nullify

  validates :name,
            presence: true,
            length: { maximum: 100 }

  validates :slug,
            presence: true,
            uniqueness: true,
            length: { maximum: 100 },
            format: {
              with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/
            }

  validates :position,
            numericality: {
              only_integer: true,
              greater_than_or_equal_to: 0
            }

  scope :active, -> { where(active: true) }

  before_validation :normalize_slug

  private

  def normalize_slug
    self.slug = slug.to_s.strip.downcase
  end
end
