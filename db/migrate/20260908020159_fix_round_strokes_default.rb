class FixRoundStrokesDefault < ActiveRecord::Migration[8.0]
  def up
    # Existing rounds may have NULL strokes.
    # SQLite stores the JSON value as text.
    execute <<~SQL
      UPDATE rounds
      SET strokes = '[]'
      WHERE strokes IS NULL
    SQL

    # New rounds get an empty array by default.
    change_column_default :rounds, :strokes, from: nil, to: []

    # Existing NULLs have now been replaced.
    change_column_null :rounds, :strokes, false
  end

  def down
    change_column_null :rounds, :strokes, true
    change_column_default :rounds, :strokes, from: [], to: nil
  end
end
