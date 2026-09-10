class Word < ApplicationRecord
  belongs_to :category

  validates :text,
            presence: true,
            length: { in: 1..100 }

  validates :difficulty,
            presence: true

  validates :active,
            inclusion: { in: [true, false] }

  scope :active, -> { where(active: true) }

  scope :for_category, lambda { |category|
    category.present? ? where(category: category) : all
  }

  def self.random_for_category(category = nil, count = 3, difficulty = 2)
    scope = active

    if category.present?
      if category.slug == "random"
        scope = scope
          .joins(:category)
          .where.not(categories: { slug: %w[random sobriety] })
      else
        scope = scope.where(category: category)
      end
    end

    difficulty = difficulty.to_i

    difficulty_pool =
      case difficulty
      when 1
        [
          [1, 80],
          [2, 20]
        ]
      when 3
        [
          [2, 20],
          [3, 80]
        ]
      else
        [
          [1, 40],
          [2, 40],
          [3, 20]
        ]
      end

    selected = []

    count.times do
      difficulty_level = weighted_difficulty(difficulty_pool)

      word = scope
        .where(difficulty: difficulty_level)
        .where.not(id: selected.map(&:id))
        .order(Arel.sql("RANDOM()"))
        .first

      # Fall back to any unused word if that difficulty bucket
      # doesn't have enough words.
      word ||= scope
        .where.not(id: selected.map(&:id))
        .order(Arel.sql("RANDOM()"))
        .first

      selected << word if word
    end

    selected
  end

  def self.weighted_difficulty(pool)
    total = pool.sum { |_difficulty, weight| weight }
    roll = rand(1..total)

    pool.each do |difficulty, weight|
      return difficulty if roll <= weight

      roll -= weight
    end

    pool.last.first
  end

  private_class_method :weighted_difficulty
end
