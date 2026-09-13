require "test_helper"

class GameRoomGameDrawingTest < ActiveSupport::TestCase
  setup do
    @game_room = GameRoom.create!(
      code: SecureRandom.alphanumeric(4).upcase,
      status: "drawing",
      current_round: 1,
      total_rounds: 3,
      round_duration: 90,
      game_number: 1,
      mode: "classic",
      name: "Drawing test"
    )
    @drawer = @game_room.players.create!(
      name: "Drawer",
      position: 0,
      score: 0,
      connected: true
    )
    @round = @game_room.rounds.create!(
      number: 1,
      game_number: 1,
      drawer: @drawer,
      word: "kite",
      status: "drawing",
      started_at: Time.current,
      strokes: []
    )
  end

  test "persists canonical shape geometry and an automatically filled pen" do
    GameRoomGame.draw_stroke!(
      @game_room,
      @drawer,
      id: "shape-1",
      type: "shape",
      shape: "triangle",
      bounds: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
      points: [[0.25, 0.1], [0.4, 0.3], [0.1, 0.3], [0.25, 0.1]],
      color: "#112233",
      width: 6,
      fill: "#abcdef"
    )
    GameRoomGame.draw_stroke!(
      @game_room,
      @drawer,
      id: "pen-1",
      type: "stroke",
      points: [[0.5, 0.5], [0.8, 0.5], [0.7, 0.8], [0.5, 0.5]],
      color: "#010203",
      width: 4,
      pen: true,
      closed: true,
      fill: "#aabbcc"
    )

    shape, pen = @round.reload.strokes
    assert_equal "triangle", shape.fetch("shape")
    assert_equal({
      "x" => 0.1,
      "y" => 0.1,
      "width" => 0.3,
      "height" => 0.2
    }, shape.fetch("bounds"))
    assert_equal 4, shape.fetch("points").length
    assert_equal "#abcdef", shape.fetch("fill")
    assert pen.fetch("closed")
    assert_equal "#aabbcc", pen.fetch("fill")
    assert_equal pen.fetch("points").first, pen.fetch("points").last
  end

  test "records edits reorder compound erase and clear as individually undoable actions" do
    two_strokes.each do |stroke|
      GameRoomGame.draw_stroke!(@game_room, @drawer, stroke)
    end

    GameRoomGame.update_object!(
      @game_room,
      @drawer,
      id: "update-1",
      type: "object_update",
      objectId: "stroke-1",
      changes: { color: "#abcdef", width: 12 }
    )
    GameRoomGame.reorder_layers!(
      @game_room,
      @drawer,
      id: "reorder-1",
      type: "layer_reorder",
      order: ["stroke-2", "stroke-1"]
    )
    GameRoomGame.draw_stroke!(
      @game_room,
      @drawer,
      id: "erase-1",
      type: "erase",
      changes: [
        {
          objectId: "stroke-1",
          after: [
            stroke_payload("stroke-1", [[0.1, 0.1], [0.2, 0.2]]),
            stroke_payload("stroke-1-piece-2", [[0.4, 0.4], [0.5, 0.5]])
          ]
        }
      ]
    )
    GameRoomGame.clear_canvas!(
      @game_room,
      @drawer,
      id: "clear-1",
      type: "canvas_clear"
    )
    # ActionCable may retry a command after the first persistence succeeds.
    GameRoomGame.clear_canvas!(
      @game_room,
      @drawer,
      id: "clear-1",
      type: "canvas_clear"
    )

    history = @round.reload.strokes
    assert_equal %w[stroke stroke object_update layer_reorder erase canvas_clear],
      history.map { |operation| operation.fetch("type") }

    GameRoomGame.undo_stroke!(@game_room, @drawer, "clear-1")
    assert_equal "erase", @round.reload.strokes.last.fetch("type")

    GameRoomGame.undo_stroke!(@game_room, @drawer, "erase-1")
    assert_equal "layer_reorder", @round.reload.strokes.last.fetch("type")
  end

  test "rejects undo of anything except the latest persisted action" do
    two_strokes.each do |stroke|
      GameRoomGame.draw_stroke!(@game_room, @drawer, stroke)
    end

    error = assert_raises(GameRoomGame::Error) do
      GameRoomGame.undo_stroke!(@game_room, @drawer, "stroke-1")
    end

    assert_equal "Nothing to undo.", error.message
    assert_equal 2, @round.reload.strokes.length
  end

  private

  def two_strokes
    [
      stroke_payload("stroke-1", [[0.1, 0.1], [0.5, 0.5]]),
      stroke_payload("stroke-2", [[0.2, 0.8], [0.8, 0.2]])
    ]
  end

  def stroke_payload(id, points)
    {
      id: id,
      type: "stroke",
      points: points,
      color: "#18181b",
      width: 6
    }
  end
end
