class GameRoomChannel < ApplicationCable::Channel
  # --------------------------------------------------------------------------
  # Subscribe
  # --------------------------------------------------------------------------

  def subscribed
    @explicitly_left = false

    @player = Player.find_by_player_token(
      params[:player_token]
    )

    unless @player
      reject
      return
    end

    @game_room = GameRoom.find_by(
      code: params[:code].to_s.upcase
    )

    unless @game_room &&
           @player.game_room_id == @game_room.id
      reject
      return
    end

    @connection_token = @player.begin_connection!

    stream_from "game_room:#{@game_room.id}"
    stream_from "player:#{@player.id}"

    GameRoomBroadcaster.lobby_updated(@game_room)

    sync_current_game_state
  end

  # --------------------------------------------------------------------------
  # Start game
  # --------------------------------------------------------------------------

  def start_game(_data)
    GameRoomGame.start!(
      @game_room,
      @player
    )
  rescue GameRoomGame::Error => e
    transmit(
      {
        type: "game_error",
        message: e.message
      }
    )
  rescue StandardError => e
    Rails.logger.error(
      "[GameRoomChannel] start_game failed: " \
      "#{e.class}: #{e.message}"
    )

    Rails.logger.error(
      e.backtrace.first(10).join("\n")
    )

    transmit(
      {
        type: "game_error",
        message: "Unable to start the game."
      }
    )
  end

  # --------------------------------------------------------------------------
# Leave room
# --------------------------------------------------------------------------

def leave_room(_data = {})
  GameRoomGame.leave_room!(
    @game_room,
    @player
  )

  transmit(
    {
      type: "room_left"
    }
  )

  @explicitly_left = true

  stop_all_streams
rescue GameRoomGame::Error => e
  transmit(
    {
      type: "game_error",
      message: e.message
    }
  )
rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] leave_room failed: " \
    "#{e.class}: #{e.message}"
  )

  Rails.logger.error(
    e.backtrace.first(10).join("\n")
  )

  transmit(
    {
      type: "game_error",
      message: "Unable to leave the room."
    }
  )
end

  def set_ready
  GameRoomGame.set_ready!(@game_room, @player)
rescue GameRoomGame::Error => e
  transmit(
    {
      type: "game_error",
      message: e.message
    }
  )
rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel#set_ready] #{e.class}: #{e.message}"
  )
  Rails.logger.error(e.backtrace.first(10).join("\n"))

  transmit(
    {
      type: "game_error",
      message: "Unable to ready up."
    }
  )
end

  # --------------------------------------------------------------------------
  # Submit guess
  # --------------------------------------------------------------------------

  def submit_guess(data)
      GameRoomGame.submit_guess!(
        @game_room,
        @player,
        data["text"]
      )
    rescue GameRoomGame::Error => e
      transmit(
        {
          type: "game_error",
          message: e.message
        }
      )
    rescue StandardError => e
      Rails.logger.error(
        "[GameRoomChannel] submit_guess failed: " \
        "#{e.class}: #{e.message}"
      )

      transmit(
        {
          type: "game_error",
          message: "Unable to submit your guess."
        }
      )
    end

  # --------------------------------------------------------------------------
  # Choose word
  # --------------------------------------------------------------------------

  def choose_word(data)
    GameRoomGame.choose_word!(
      @game_room,
      @player,
      data["word"]
    )
  rescue GameRoomGame::Error => e
    transmit(
      {
        type: "game_error",
        message: e.message
      }
    )
  rescue StandardError => e
    Rails.logger.error(
      "[GameRoomChannel] choose_word failed: " \
      "#{e.class}: #{e.message}"
    )

    Rails.logger.error(
      e.backtrace.first(10).join("\n")
    )

    transmit(
      {
        type: "game_error",
        message: "Unable to choose that word."
      }
    )
  end

  # --------------------------------------------------------------------------
  # Draw
  # --------------------------------------------------------------------------

def draw_live(data)
  round = current_round!

  unless round.drawer_id == @player.id
    raise GameRoomGame::Error,
          "Only the drawer can draw."
  end

  deadline =
    round.started_at +
    @game_room.round_duration.seconds

  if Time.current >= deadline
    raise GameRoomGame::Error,
          "Time is up."
  end

  payload = sanitize_live_stroke(data)

  case payload[:type]
  when "start"
    GameRoomBroadcaster.stroke_started(
      @game_room,
      round,
      payload[:stroke]
    )

  when "points"
    GameRoomBroadcaster.stroke_points(
      @game_room,
      round,
      payload[:stroke]
    )
  end

rescue GameRoomGame::Error => e
  transmit(
    {
      type: "game_error",
      message: e.message
    }
  )

rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] draw_live failed: " \
    "#{e.class}: #{e.message}"
  )

  Rails.logger.error(
    e.backtrace.first(10).join("\n")
  )

  transmit(
    {
      type: "game_error",
      message: "Unable to send live drawing."
    }
  )
end

def play_again
  Rails.logger.info(
    "[GameRoomChannel] play_again requested by player #{@player.id} in room #{@game_room.code}"
  )

  GameRoomGame.play_again!(@game_room, @player)

rescue GameRoomGame::Error => e
  Rails.logger.warn(
    "[GameRoomChannel] play_again rejected: #{e.class}: #{e.message}"
  )

  transmit(
    {
      type: "game_error",
      message: e.message
    }
  )

rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] play_again FAILED: #{e.class}: #{e.message}"
  )

  Rails.logger.error(
    e.backtrace.first(15).join("\n")
  )

  transmit(
    {
      type: "game_error",
      message: "Unable to start the game again."
    }
  )
end

def draw_stroke(data)
  stroke = sanitize_stroke(data)

  # --------------------------------------------------------------------------
  # Validate operation-specific payload
  # --------------------------------------------------------------------------

  if stroke[:type] == "fill"
    point = Array(stroke[:point])

    unless point.length == 2
      transmit(
        {
          type: "game_error",
          message: "Invalid fill point."
        }
      )
      return
    end
  elsif Array(stroke[:points]).empty?
    transmit(
      {
        type: "game_error",
        message: "Invalid stroke points."
      }
    )
    return
  end

  # --------------------------------------------------------------------------
  # Persist the operation
  # --------------------------------------------------------------------------

  round =
    GameRoomGame.draw_stroke!(
      @game_room,
      @player,
      stroke
    )

  # --------------------------------------------------------------------------
  # Get the canonical persisted operation
  # --------------------------------------------------------------------------

  saved_stroke =
    Array(round.strokes).find do |existing|
      existing["id"].to_s == stroke[:id].to_s
    end

  return unless saved_stroke

  # --------------------------------------------------------------------------
  # Broadcast to everyone in the room
  # --------------------------------------------------------------------------

  ActionCable.server.broadcast(
    "game_room:#{@game_room.id}",
    {
      type: "stroke_drawn",
      round: {
        id: round.id,
        number: round.number
      },
      stroke: saved_stroke
    }
  )

rescue GameRoomGame::Error => e
  transmit(
    {
      type: "game_error",
      message: e.message
    }
  )

rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] draw_stroke failed: " \
    "#{e.class}: #{e.message}"
  )

  Rails.logger.error(
    e.backtrace.first(10).join("\n")
  )

  transmit(
    {
      type: "game_error",
      message: "Unable to save that stroke."
    }
  )
end

# --------------------------------------------------------------------------
# Undo stroke
# --------------------------------------------------------------------------

def undo_stroke(data)
  stroke_id =
    data["stroke_id"].to_s.first(100)

  if stroke_id.blank?
    transmit(
      {
        type: "game_error",
        message: "Invalid stroke ID."
      }
    )

    return
  end

  # --------------------------------------------------------------
  # Remove the stroke from the persisted drawing.
  # --------------------------------------------------------------

  round =
    GameRoomGame.undo_stroke!(
      @game_room,
      @player,
      stroke_id
    )

  # --------------------------------------------------------------
  # Tell everyone the stroke disappeared.
  # --------------------------------------------------------------

  ActionCable.server.broadcast(
    "game_room:#{@game_room.id}",
    {
      type: "stroke_undone",
      round: {
        id: round.id,
        number: round.number
      },
      stroke_id: stroke_id
    }
  )

rescue GameRoomGame::Error => e
  transmit(
    {
      type: "game_error",
      message: e.message
    }
  )

rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] undo_stroke failed: " \
    "#{e.class}: #{e.message}"
  )

  Rails.logger.error(
    e.backtrace.first(10).join("\n")
  )

  transmit(
    {
      type: "game_error",
      message: "Unable to undo that stroke."
    }
  )
end

  # --------------------------------------------------------------------------
  # Clear canvas
  # --------------------------------------------------------------------------

  def clear_canvas
  # --------------------------------------------------------------
  # Clear the authoritative persisted drawing.
  # --------------------------------------------------------------

  round =
    GameRoomGame.clear_canvas!(
      @game_room,
      @player
    )

  # --------------------------------------------------------------
  # Tell everyone the canvas was cleared.
  # --------------------------------------------------------------

  ActionCable.server.broadcast(
    "game_room:#{@game_room.id}",
    {
      type: "canvas_cleared",
      round: {
        id: round.id,
        number: round.number
      }
    }
  )

rescue GameRoomGame::Error => e
  transmit(
    {
      type: "game_error",
      message: e.message
    }
  )

rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] clear_canvas failed: " \
    "#{e.class}: #{e.message}"
  )

  Rails.logger.error(
    e.backtrace.first(10).join("\n")
  )

  transmit(
    {
      type: "game_error",
      message: "Unable to clear the canvas."
    }
  )
end

# --------------------------------------------------------------------------
# Disconnect
# --------------------------------------------------------------------------

def unsubscribed
  return if @explicitly_left
  return unless @player && @connection_token

  player = @player
  connection_token = @connection_token
  game_room = @game_room

  # Mark this specific connection as disconnected.
  player.end_connection!(connection_token)

  GameRoomBroadcaster.lobby_updated(game_room)

  # ------------------------------------------------------------------------
  # If this player was the active drawer, immediately end the round.
  # ------------------------------------------------------------------------

  game_room.reload

  return unless game_room.status == "drawing"

  round = game_room.rounds.find_by(
    game_number: game_room.game_number,
    number: game_room.current_round
  )

  return unless round&.status == "drawing"
  return unless round.drawer_id == player.id

  Rails.logger.info(
    "[GameRoomChannel] Drawer disconnected; " \
    "ending round immediately " \
    "room=#{game_room.code} " \
    "player=#{player.id} " \
    "round=#{round.id}"
  )

  GameRoomGame
    .new(game_room, player)
    .end_round!(
      round,
      reason: :drawer_disconnected
    )
end

  private

  # --------------------------------------------------------------------------
  # Restore current game state for a newly connected browser
  # --------------------------------------------------------------------------

def sync_current_game_state
  completed_rounds = @game_room.rounds
    .where(game_number: @game_room.game_number, status: "ended")
    .order(:number)

  transmit({
    type: "completed_rounds",
    rounds: completed_rounds.map do |round|
      {
        id: round.id,
        number: round.number,
        drawer: {
          id: round.drawer.id,
          name: round.drawer.name
        },
        winner: round.winner && {
          id: round.winner.id,
          name: round.winner.name
        },
        word: round.word,
        guesses: Array(round.guesses),
        strokes: Array(round.strokes),
        ended_at: round.ended_at&.iso8601
      }
    end
  })

  round = @game_room.rounds.find_by(
    game_number: @game_room.game_number,
    number: @game_room.current_round
  )

  return unless round

  # --------------------------------------------------------------------------
  # Ready / starting phase
  # --------------------------------------------------------------------------

  if round.status == "starting"
    transmit(
      {
        type: "round_starting",
        round: {
          id: round.id,
          number: round.number,
          drawer: {
            id: round.drawer.id,
            name: round.drawer.name
          }
        },
        ready_player_ids:
          round.round_readies.pluck(:player_id)
      }
    )

    # Only the drawer receives the secret word choices.
    if round.drawer_id == @player.id
      transmit(
        {
          type: "word_options",
          round: {
            id: round.id,
            number: round.number
          },
          words: round.word_options
        }
      )
    end

    return
  end

    # --------------------------------------------------------------------------
    # Leave room
    # --------------------------------------------------------------------------

    def leave_room(_data = {})
      @explicitly_left = true

      GameRoomGame.leave_room!(
        @game_room,
        @player
      )

      transmit(
        {
          type: "room_left"
        }
      )

      stop_all_streams
    rescue GameRoomGame::Error => e
      transmit(
        {
          type: "game_error",
          message: e.message
        }
      )
    rescue StandardError => e
      Rails.logger.error(
        "[GameRoomChannel] leave_room failed: " \
        "#{e.class}: #{e.message}"
      )

      Rails.logger.error(
        e.backtrace.first(10).join("\n")
      )

      transmit(
        {
          type: "game_error",
          message: "Unable to leave the room."
        }
      )
    end

  # --------------------------------------------------------------------------
  # Drawing phase
  # --------------------------------------------------------------------------

  if round.status == "drawing"
    transmit(
      {
        type: "round_started",
        round: {
          id: round.id,
          number: round.number,
          drawer: {
            id: round.drawer.id,
            name: round.drawer.name
          },
          started_at: round.started_at.iso8601,
          duration: @game_room.round_duration,
          strokes: Array(round.strokes)
        }
      }
    )

    return
  end

  # --------------------------------------------------------------------------
  # Ended phase
  # --------------------------------------------------------------------------

  if round.status == "ended"
  transmit(
    {
      type: "round_ended",
      game_room: {
        id: @game_room.id,
        code: @game_room.code,
        status: @game_room.status,
        current_round: @game_room.current_round,
        total_rounds: @game_room.total_rounds,
        round_duration: @game_room.round_duration
      },
      final: @game_room.status == "finished",
      round: {
        id: round.id,
        number: round.number,
        drawer: {
          id: round.drawer.id,
          name: round.drawer.name
        },
        winner:
          if round.winner
            {
              id: round.winner.id,
              name: round.winner.name
            }
          end,
        word: round.word,
        guesses:
          round.guesses
            .includes(:player)
            .order(:created_at)
            .map do |guess|
              {
                id: guess.id,
                player: {
                  id: guess.player.id,
                  name: guess.player.name
                },
                text: guess.text,
                correct: guess.correct
              }
            end,
        ended_at: round.ended_at&.iso8601,
        strokes: round.strokes
      }
    }
  )

  # ------------------------------------------------------------
  # Finished game hydration
  # ------------------------------------------------------------

  if @game_room.status == "finished"
    transmit(
      {
        type: "game_finished",
        game_room: {
          id: @game_room.id,
          code: @game_room.code,
          status: @game_room.status,
          current_round: @game_room.current_round,
          total_rounds: @game_room.total_rounds,
          round_duration: @game_room.round_duration
        },
        scores: @game_room.players
          .order(:position)
          .map do |player|
            {
              id: player.id,
              name: player.name,
              score: player.score
            }
          end
      }
    )
  end
end

end

  # --------------------------------------------------------------------------
  # Current active round
  # --------------------------------------------------------------------------

  def current_round!
  @game_room.reload

  round =
    @game_room.rounds.find_by(
      game_number: @game_room.game_number,
      number: @game_room.current_round
    )

  Rails.logger.info(
    "[GameRoomChannel] current_round! " \
    "room=#{@game_room.id} " \
    "game=#{@game_room.game_number} " \
    "current_round=#{@game_room.current_round} " \
    "room_status=#{@game_room.status} " \
    "round_id=#{round&.id} " \
    "round_game=#{round&.game_number} " \
    "round_number=#{round&.number} " \
    "round_status=#{round&.status}"
  )

  raise GameRoomGame::Error, "No active round." unless round

  unless @game_room.status == "drawing" && round.status == "drawing"
    raise GameRoomGame::Error, "The round is not currently drawing."
  end

  round
end

 def sanitize_live_stroke(data)
  type = data["type"].to_s

  unless %w[start points].include?(type)
    raise GameRoomGame::Error,
          "Invalid live drawing event."
  end

  raw_stroke = data["stroke"]

  unless raw_stroke.is_a?(Hash)
    raise GameRoomGame::Error,
          "Invalid live stroke."
  end

  operation_type =
    raw_stroke["type"].to_s

  operation_type =
    "stroke" if operation_type.blank?

  unless %w[stroke eraser].include?(operation_type)
    raise GameRoomGame::Error,
          "Invalid live drawing operation."
  end

  points =
    Array(raw_stroke["points"])
      .first(500)
      .filter_map do |point|
        next unless point.is_a?(Array)
        next unless point.length == 2

        x = Float(point[0]) rescue nil
        y = Float(point[1]) rescue nil

        next unless x && y

        [
          x.clamp(0.0, 1.0),
          y.clamp(0.0, 1.0)
        ]
      end

  color =
    raw_stroke["color"].to_s

  color =
    if color.match?(/\A#[0-9a-fA-F]{6}\z/)
      color
    else
      "#18181b"
    end

  width =
    raw_stroke["width"]
      .to_f
      .clamp(1.0, 30.0)

  id =
    raw_stroke["id"]
      .to_s
      .first(100)

  raise GameRoomGame::Error,
        "Invalid stroke ID." if id.blank?

  raise GameRoomGame::Error,
        "Invalid stroke points." if points.empty?

  {
    type: type,
    stroke: {
      id: id,
      type: operation_type,
      points: points,
      color: color,
      width: width
    }
  }
end



  # --------------------------------------------------------------------------
  # Sanitize drawing data
  # --------------------------------------------------------------------------

  def sanitize_stroke(data)
  data = data.to_h.stringify_keys

  type =
    data["type"].to_s

  type = "stroke" if type.blank?

  unless %w[stroke eraser fill].include?(type)
    raise GameRoomGame::Error,
          "Invalid drawing operation."
  end

  # --------------------------------------------------------------------------
  # Fill
  # --------------------------------------------------------------------------

  if type == "fill"
    point =
      Array(data["point"])

    unless point.length == 2
      raise GameRoomGame::Error,
            "Invalid fill point."
    end

    x = Float(point[0]) rescue nil
    y = Float(point[1]) rescue nil

    unless x && y
      raise GameRoomGame::Error,
            "Invalid fill point."
    end

    color =
      data["color"].to_s

    color =
      if color.match?(/\A#[0-9a-fA-F]{6}\z/)
        color
      else
        "#18181b"
      end

    id =
      data["id"]
        .to_s
        .first(100)

    raise GameRoomGame::Error,
          "Invalid drawing operation ID." if id.blank?

    return {
      id: id,
      type: "fill",
      point: [
        x.clamp(0.0, 1.0),
        y.clamp(0.0, 1.0)
      ],
      color: color
    }
  end

  # --------------------------------------------------------------------------
  # Stroke / Eraser
  # --------------------------------------------------------------------------

  points =
    Array(data["points"])
      .first(5000)
      .filter_map do |point|
        next unless point.is_a?(Array)
        next unless point.length == 2

        x = Float(point[0]) rescue nil
        y = Float(point[1]) rescue nil

        next unless x && y

        [
          x.clamp(0.0, 1.0),
          y.clamp(0.0, 1.0)
        ]
      end

  color =
    data["color"].to_s

  color =
    if color.match?(/\A#[0-9a-fA-F]{6}\z/)
      color
    else
      "#18181b"
    end

  width =
    data["width"]
      .to_f
      .clamp(1.0, 30.0)

  id =
    data["id"]
      .to_s
      .first(100)

  {
    id: id,
    type: type,
    points: points,
    color: color,
    width: width
  }
end
end
