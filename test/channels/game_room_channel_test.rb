require "test_helper"
require "digest"

class GameRoomChannelTest < ActionCable::Channel::TestCase
  setup do
    @token = SecureRandom.urlsafe_base64(24)
    @game_room = GameRoom.create!(
      code: SecureRandom.alphanumeric(4).upcase,
      status: "drawing",
      current_round: 1,
      total_rounds: 3,
      round_duration: 90,
      game_number: 1,
      mode: "classic",
      name: "Channel drawing test"
    )
    @game = @game_room.games.create!(
      number: 1,
      mode: "classic",
      status: "active",
      current_round: 1,
      total_rounds: 3,
      round_duration: 90,
      difficulty: "medium"
    )
    @drawer = @game_room.players.create!(
      name: "Drawer",
      position: 0,
      score: 0,
      connected: true,
      player_token_digest: Digest::SHA256.hexdigest(@token)
    )
    @game.game_players.create!(
      player: @drawer,
      name_snapshot: @drawer.name,
      score: 0,
      position: 0
    )
  end

  test "a drawer websocket refresh does not end the active round" do
    round = create_round(started_at: Time.current)

    subscribe(code: @game_room.code, player_token: @token)
    assert subscription.confirmed?

    unsubscribe

    assert_equal "drawing", round.reload.status
    assert_equal "drawing", @game_room.reload.status
  end

  test "subscription finalizes an expired drawing round" do
    round = create_round(started_at: 2.minutes.ago)

    subscribe(code: @game_room.code, player_token: @token)
    assert subscription.confirmed?

    assert_equal "ended", round.reload.status
    assert_equal "finished", @game_room.reload.status
  end

  test "a completed operation cannot spill into a newer round" do
    first_round = create_round(started_at: Time.current)
    subscribe(code: @game_room.code, player_token: @token)

    first_round.update!(status: "ended", ended_at: Time.current)
    second_round = @game_room.rounds.create!(
      number: 2,
      game_number: 1,
      drawer: @drawer,
      word: "boat",
      status: "drawing",
      started_at: Time.current,
      strokes: []
    )
    @game.update!(current_round: 2)
    @game_room.update!(current_round: 2)

    perform :draw_stroke, {
      round_id: first_round.id,
      id: "late-stroke",
      type: "stroke",
      points: [[0.1, 0.1], [0.2, 0.2]],
      color: "#18181b",
      width: 6
    }

    assert_empty second_round.reload.strokes
    assert_equal "The drawing round changed. Please try again.",
      transmissions.last.fetch("message")
  end

  test "a cancelled touch gesture clears its live preview" do
    round = create_round(started_at: Time.current)
    subscribe(code: @game_room.code, player_token: @token)

    assert_broadcast_on(
      "game_room:#{@game_room.id}",
      {
        type: "stroke_points",
        round: { id: round.id, number: round.number },
        stroke: { id: "touch-preview", cancelled: true, points: [] }
      }
    ) do
      perform :draw_live, {
        round_id: round.id,
        type: "cancel",
        stroke: { "id" => "touch-preview" }
      }
    end
  end

  test "drawing reconnect includes existing guesses in chronological order" do
    round = create_round(started_at: Time.current)
    guesser = @game_room.players.create!(
      name: "Guesser",
      position: 1,
      score: 0,
      connected: true
    )
    round.guesses.create!(player: guesser, text: "first", correct: false)
    round.guesses.create!(player: guesser, text: "second", correct: false)

    subscribe(code: @game_room.code, player_token: @token)

    payload = transmissions.find { |item| item["type"] == "round_started" }
    assert_equal ["first", "second"], payload.dig("round", "guesses").pluck("text")
  end

  private

  def create_round(started_at:)
    @game_room.rounds.create!(
      number: 1,
      game_number: 1,
      drawer: @drawer,
      word: "kite",
      status: "drawing",
      started_at: started_at,
      strokes: []
    )
  end
end
