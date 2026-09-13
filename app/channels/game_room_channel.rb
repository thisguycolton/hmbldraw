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
  data = data.to_h.stringify_keys
  round = active_editor_round!(data, cached: true)
  return unless round

  unless round.drawer_id == @player.id
    raise GameRoomGame::Error,
          "Only the drawer can draw."
  end

  payload = sanitize_live_stroke(data)

  case payload[:type]
  when "start"
    round = GameRoomGame.start_drawing_timer!(
      @game_room,
      @player
    ) if round.started_at.nil?

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

  when "cancel"
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
  data = data.to_h.stringify_keys
  stroke = sanitize_stroke(data)

  # --------------------------------------------------------------------------
  # Validate operation-specific payload
  # --------------------------------------------------------------------------

  if stroke[:type] == "erase"
    if Array(stroke[:changes]).empty?
      transmit(
        {
          type: "game_error",
          message: "Invalid erase operation."
        }
      )
      return
    end
  elsif stroke[:type] == "fill"
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
  elsif stroke[:type] == "shape"
    unless stroke[:shape].present? && stroke[:bounds].is_a?(Hash)
      transmit(
        {
          type: "game_error",
          message: "Invalid shape."
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

  active_round = active_editor_round!(data)
  return unless active_round

  if active_round.started_at.nil?
    GameRoomGame.start_drawing_timer!(
      @game_room,
      @player
    )
  end

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

  unless saved_stroke
    Rails.logger.warn(
      "[GameRoomChannel] draw_stroke persisted operation not found: "       "id=#{stroke[:id]}"
    )
    return
  end

  Rails.logger.debug(
    "[GameRoomChannel] persisted stroke id=#{saved_stroke["id"]} "     "type=#{saved_stroke["type"]} pen=#{saved_stroke["pen"]} "     "closed=#{saved_stroke["closed"]} fill=#{saved_stroke["fill"].inspect}"
  )

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
      stroke: saved_stroke,
      strokes: Array(round.strokes)
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

  message = "Unable to save that stroke."
  message = "#{message} #{e.class}: #{e.message}" if Rails.env.development?

  transmit(type: "game_error", message: message)
end

# --------------------------------------------------------------------------
# Reorder layers
# --------------------------------------------------------------------------

def reorder_layers(data)
  return unless active_editor_round!(data)

  operation = sanitize_layer_reorder(data)

  round =
    GameRoomGame.reorder_layers!(
      @game_room,
      @player,
      operation
    )

  saved_operation =
    Array(round.strokes).find do |existing|
      existing["id"].to_s == operation[:id].to_s
    end

  return unless saved_operation

  ActionCable.server.broadcast(
    "game_room:#{@game_room.id}",
    {
      type: "layer_reordered",
      round: {
        id: round.id,
        number: round.number
      },
      operation: saved_operation,
      strokes: Array(round.strokes)
    }
  )

rescue GameRoomGame::Error => e
  transmit(type: "game_error", message: e.message)
rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] reorder_layers failed: #{e.class}: #{e.message}"
  )
  Rails.logger.error(e.backtrace.first(10).join("\n"))
  transmit(
    type: "game_error",
    message: "Unable to reorder layers."
  )
end

# --------------------------------------------------------------------------
# Update vector object

# --------------------------------------------------------------------------

def update_object(data)
  return unless active_editor_round!(data)

  operation = sanitize_object_update(data)

  round =
    GameRoomGame.update_object!(
      @game_room,
      @player,
      operation
    )

  saved_operation =
    Array(round.strokes).find do |existing|
      existing["id"].to_s == operation[:id].to_s
    end

  return unless saved_operation

  ActionCable.server.broadcast(
    "game_room:#{@game_room.id}",
    {
      type: "object_updated",
      round: {
        id: round.id,
        number: round.number
      },
      operation: saved_operation,
      strokes: Array(round.strokes)
    }
  )

rescue GameRoomGame::Error => e
  transmit(type: "game_error", message: e.message)
rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] update_object failed: #{e.class}: #{e.message}"
  )
  Rails.logger.error(e.backtrace.first(10).join("\n"))
  transmit(type: "game_error", message: "Unable to update that drawing object.")
end

# --------------------------------------------------------------------------
# Delete vector object
# --------------------------------------------------------------------------

def delete_object(data)
  return unless active_editor_round!(data)

  operation = sanitize_object_delete(data)

  round =
    GameRoomGame.delete_object!(
      @game_room,
      @player,
      operation
    )

  saved_operation =
    Array(round.strokes).find do |existing|
      existing["id"].to_s == operation[:id].to_s
    end

  return unless saved_operation

  ActionCable.server.broadcast(
    "game_room:#{@game_room.id}",
    {
      type: "object_deleted",
      round: {
        id: round.id,
        number: round.number
      },
      operation: saved_operation,
      strokes: Array(round.strokes)
    }
  )

rescue GameRoomGame::Error => e
  transmit(type: "game_error", message: e.message)
rescue StandardError => e
  Rails.logger.error(
    "[GameRoomChannel] delete_object failed: #{e.class}: #{e.message}"
  )
  Rails.logger.error(e.backtrace.first(10).join("\n"))
  transmit(type: "game_error", message: "Unable to delete that drawing object.")
end

# --------------------------------------------------------------------------
# Undo stroke
# --------------------------------------------------------------------------

def undo_stroke(data)
  return unless active_editor_round!(data)

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
      stroke_id: stroke_id,
      strokes: Array(round.strokes)
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

  def clear_canvas(data = {})
  return unless active_editor_round!(data)

  operation = sanitize_canvas_clear(data)

  # --------------------------------------------------------------
  # Clear the authoritative persisted drawing.
  # --------------------------------------------------------------

  round =
    GameRoomGame.clear_canvas!(
      @game_room,
      @player,
      operation
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
      },
      operation: operation,
      strokes: Array(round.strokes)
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

  # A WebSocket disconnect is not the same as leaving the room. Refreshes,
  # mobile network changes, and HMR all disconnect briefly. Keep the active
  # round alive so the drawer can reconnect; the existing timeout job remains
  # responsible for ending an abandoned round.
end

  private

  def active_editor_round!(data, cached: false)
  data = data.to_h.stringify_keys
  round = live_drawing_round!(
    data["round_id"],
    refresh: !cached
  )

  return round unless round.started_at

  deadline =
    round.started_at +
    @game_room.round_duration.seconds

  if Time.current >= deadline
    GameRoomGame.end_round!(
      @game_room,
      round
    )
    return nil
  end

  round
end

  def live_drawing_round!(expected_round_id = nil, refresh: false)
  expected_round_id = expected_round_id.to_i if expected_round_id.present?
  round = @live_drawing_round

  if !refresh &&
     round &&
     (!expected_round_id || round.id == expected_round_id)
    return round
  end

  @game_room.reload

  round =
    @game_room.rounds.find_by(
      game_number: @game_room.game_number,
      number: @game_room.current_round
    )

  raise GameRoomGame::Error, "No active round." unless round

  if expected_round_id && round.id != expected_round_id
    raise GameRoomGame::Error,
          "The drawing round changed. Please try again."
  end

  unless @game_room.status == "drawing" &&
         round.status == "drawing"
    raise GameRoomGame::Error,
          "The round is not currently drawing."
  end

  @live_drawing_round = round

  round
end

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

  if round.status == "drawing" &&
     round.started_at &&
     Time.current >= round.started_at + @game_room.round_duration.seconds
    GameRoomGame.end_round!(
      @game_room,
      round
    )
    return
  end

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
          started_at: round.started_at&.iso8601,
          duration: @game_room.round_duration,
          strokes: Array(round.strokes),
          guesses: round.guesses.includes(:player).order(:created_at).map do |guess|
            {
              id: guess.id,
              player: { id: guess.player.id, name: guess.player.name },
              text: guess.text,
              correct: guess.correct
            }
          end
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
  data = data.to_h.stringify_keys
  type = data["type"].to_s

  unless %w[start points cancel].include?(type)
    raise GameRoomGame::Error,
          "Invalid live drawing event."
  end

  raw_stroke = data["stroke"]

  unless raw_stroke.is_a?(Hash)
    raise GameRoomGame::Error,
          "Invalid live stroke."
  end

  raw_stroke = raw_stroke.stringify_keys

  operation_type = raw_stroke["type"].to_s
  operation_type = "stroke" if operation_type.blank?

  unless %w[stroke eraser shape].include?(operation_type)
    raise GameRoomGame::Error,
          "Invalid live drawing operation."
  end

  color = raw_stroke["color"].to_s
  color = color.match?(/\A#[0-9a-fA-F]{6}\z/) ? color : "#18181b"
  width = raw_stroke["width"].to_f.clamp(1.0, 30.0)
  id = raw_stroke["id"].to_s.first(100)

  raise GameRoomGame::Error, "Invalid stroke ID." if id.blank?

  if type == "cancel"
    return {
      type: type,
      stroke: {
        id: id,
        cancelled: true,
        points: []
      }
    }
  end

  if operation_type == "shape"
    shape = raw_stroke["shape"].to_s
    unless %w[line circle square triangle].include?(shape)
      raise GameRoomGame::Error, "Invalid live shape."
    end

    bounds = raw_stroke["bounds"]
    unless bounds.is_a?(Hash)
      raise GameRoomGame::Error, "Invalid live shape bounds."
    end

    bounds = bounds.stringify_keys
    x = Float(bounds["x"]) rescue nil
    y = Float(bounds["y"]) rescue nil
    width_value = Float(bounds["width"]) rescue nil
    height_value = Float(bounds["height"]) rescue nil

    unless x && y && width_value && height_value
      raise GameRoomGame::Error, "Invalid live shape bounds."
    end

    stroke = {
      id: id,
      type: "shape",
      shape: shape,
      bounds: {
        x: x.clamp(0.0, 1.0),
        y: y.clamp(0.0, 1.0),
        width: width_value.clamp(0.0, 1.0),
        height: height_value.clamp(0.0, 1.0)
      },
      color: color,
      width: width,
      fill: (raw_stroke["fill"].to_s.match?(/\A#[0-9a-fA-F]{6}\z/) ? raw_stroke["fill"].to_s : nil)
    }

    shape_points =
      Array(raw_stroke["points"])
        .first(500)
        .filter_map do |point|
          next unless point.is_a?(Array) && point.length == 2

          px = Float(point[0]) rescue nil
          py = Float(point[1]) rescue nil

          next unless px && py

          [
            px.clamp(0.0, 1.0),
            py.clamp(0.0, 1.0)
          ]
        end

    stroke[:points] =
      shape_points if shape_points.length >= 2

    %w[start end].each do |key|
      next unless raw_stroke[key].is_a?(Array) && raw_stroke[key].length == 2
      sx = Float(raw_stroke[key][0]) rescue nil
      sy = Float(raw_stroke[key][1]) rescue nil
      stroke[key] = [sx.clamp(0.0, 1.0), sy.clamp(0.0, 1.0)] if sx && sy
    end

    return { type: type, stroke: stroke }
  end

  points =
    Array(raw_stroke["points"])
      .first(500)
      .filter_map do |point|
        next unless point.is_a?(Array) && point.length == 2
        x = Float(point[0]) rescue nil
        y = Float(point[1]) rescue nil
        next unless x && y
        [x.clamp(0.0, 1.0), y.clamp(0.0, 1.0)]
      end

  raise GameRoomGame::Error, "Invalid stroke points." if points.empty?

  {
    type: type,
    stroke: {
      id: id,
      type: operation_type,
      points: points,
      color: color,
      width: width,
      pen: !!raw_stroke["pen"],
      closed: !!raw_stroke["closed"],
      replace: !!raw_stroke["replace"],
      fill: (raw_stroke["fill"].to_s.match?(/\A#[0-9a-fA-F]{6}\z/) ? raw_stroke["fill"].to_s : nil)
    }
  }
end



  # --------------------------------------------------------------------------
  # Sanitize layer reorder operation
  # --------------------------------------------------------------------------

  def sanitize_layer_reorder(data)
    data = data.to_h.stringify_keys
    id = data["id"].to_s.first(100)
    order =
      Array(data["order"])
        .first(500)
        .map { |value| value.to_s.first(100) }
        .select(&:present?)
        .uniq

    raise GameRoomGame::Error, "Invalid layer operation ID." if id.blank?
    raise GameRoomGame::Error, "Invalid layer order." if order.empty?

    {
      id: id,
      type: "layer_reorder",
      order: order
    }
  end

  def sanitize_canvas_clear(data)
    data = data.to_h.stringify_keys
    nested = data["operation"].is_a?(Hash) ? data["operation"].stringify_keys : {}
    id = (data["id"].presence || nested["id"].presence || SecureRandom.uuid)
      .to_s
      .first(100)

    {
      id: id,
      type: "canvas_clear"
    }
  end

  # --------------------------------------------------------------------------
  # Sanitize vector editor operations
  # --------------------------------------------------------------------------

  def sanitize_object_update(data)
    data = data.to_h.stringify_keys
    id = data["id"].to_s.first(100)
    object_id = data["objectId"].to_s.first(100)
    changes = data["changes"]

    raise GameRoomGame::Error, "Invalid drawing operation ID." if id.blank?
    raise GameRoomGame::Error, "Invalid drawing object ID." if object_id.blank?
    raise GameRoomGame::Error, "Invalid drawing update." unless changes.is_a?(Hash)

    allowed = %w[points bounds color width shape start end pen closed type fill hidden pathMode]
    changes = changes.stringify_keys.slice(*allowed)

    if changes["points"]
      changes["points"] = Array(changes["points"]).first(5000).filter_map do |point|
        next unless point.is_a?(Array) && point.length == 2
        x = Float(point[0]) rescue nil
        y = Float(point[1]) rescue nil
        next unless x && y
        [x.clamp(0.0, 1.0), y.clamp(0.0, 1.0)]
      end
    end

    if changes["bounds"].is_a?(Hash)
      bounds = changes["bounds"].stringify_keys
      x = Float(bounds["x"]) rescue 0.0
      y = Float(bounds["y"]) rescue 0.0
      width_value = Float(bounds["width"]) rescue 0.0
      height_value = Float(bounds["height"]) rescue 0.0
      changes["bounds"] = {
        "x" => x.clamp(0.0, 1.0),
        "y" => y.clamp(0.0, 1.0),
        "width" => width_value.clamp(0.0, 1.0),
        "height" => height_value.clamp(0.0, 1.0)
      }
    end

    %w[start end].each do |key|
      next unless changes[key].is_a?(Array) && changes[key].length == 2
      x = Float(changes[key][0]) rescue nil
      y = Float(changes[key][1]) rescue nil
      changes[key] = x && y ? [x.clamp(0.0, 1.0), y.clamp(0.0, 1.0)] : nil
    end

    if changes.key?("color")
      color = changes["color"].to_s
      changes["color"] = color.match?(/\A#[0-9a-fA-F]{6}\z/) ? color : "#18181b"
    end

    changes["width"] = changes["width"].to_f.clamp(1.0, 30.0) if changes.key?("width")

    if changes.key?("type") && !%w[stroke shape].include?(changes["type"].to_s)
      raise GameRoomGame::Error, "Invalid drawing update type."
    end

    changes["pen"] = !!changes["pen"] if changes.key?("pen")
    changes["closed"] = !!changes["closed"] if changes.key?("closed")
    changes["hidden"] = !!changes["hidden"] if changes.key?("hidden")

    if changes.key?("fill")
      fill = changes["fill"].to_s
      changes["fill"] =
        if fill.blank?
          nil
        elsif fill.match?(%r{\A#[0-9a-fA-F]{6}\z})
          fill
        else
          "#18181b"
        end
    end

    if changes.key?("shape") && !%w[line circle square triangle].include?(changes["shape"].to_s)
      raise GameRoomGame::Error, "Invalid drawing shape."
    end

    if changes.key?("pathMode")
      path_mode = changes["pathMode"].to_s
      unless %w[linear smooth].include?(path_mode)
        raise GameRoomGame::Error, "Invalid drawing path mode."
      end
      changes["pathMode"] = path_mode
    end

    { id: id, type: "object_update", objectId: object_id, changes: changes }
  end

  def sanitize_object_delete(data)
    data = data.to_h.stringify_keys
    id = data["id"].to_s.first(100)
    object_id = data["objectId"].to_s.first(100)

    raise GameRoomGame::Error, "Invalid drawing operation ID." if id.blank?
    raise GameRoomGame::Error, "Invalid drawing object ID." if object_id.blank?

    { id: id, type: "object_delete", objectId: object_id }
  end

  # --------------------------------------------------------------------------
  # Sanitize drawing data
  # --------------------------------------------------------------------------

  def sanitize_stroke(data)
  data = data.to_h.stringify_keys

  type =
    data["type"].to_s

  type = "stroke" if type.blank?

  id =
    data["id"]
      .to_s
      .first(100)

  raise GameRoomGame::Error,
        "Invalid drawing operation ID." if id.blank?

  unless %w[stroke eraser fill shape erase].include?(type)
    raise GameRoomGame::Error,
          "Invalid drawing operation."
  end

  # --------------------------------------------------------------------------
  # Shape
  # --------------------------------------------------------------------------

  if type == "erase"
    changes = Array(data["changes"]).first(500).map do |change|
      change = change.to_h.stringify_keys
      object_id = change["objectId"].to_s.first(100)
      raise GameRoomGame::Error, "Invalid erased object ID." if object_id.blank?

      after = Array(change["after"]).first(500).map do |object|
        normalized_object = sanitize_stroke(object)
        unless %w[stroke shape].include?(normalized_object[:type])
          raise GameRoomGame::Error, "Invalid erased object geometry."
        end
        normalized_object
      end

      {
        objectId: object_id,
        after: after
      }
    end

    raise GameRoomGame::Error, "Invalid erase operation." if changes.empty?

    object_ids = changes.map { |change| change[:objectId] }
    unless object_ids.uniq.length == object_ids.length
      raise GameRoomGame::Error, "Invalid erase operation."
    end

    return {
      id: id,
      type: "erase",
      changes: changes
    }
  end

  if type == "shape"
    shape = data["shape"].to_s
    unless %w[line circle square triangle].include?(shape)
      raise GameRoomGame::Error, "Invalid shape."
    end

    bounds = data["bounds"]
    unless bounds.is_a?(Hash)
      raise GameRoomGame::Error, "Invalid shape bounds."
    end

    bounds = bounds.stringify_keys
    x = Float(bounds["x"]) rescue nil
    y = Float(bounds["y"]) rescue nil
    width_value = Float(bounds["width"]) rescue nil
    height_value = Float(bounds["height"]) rescue nil

    unless x && y && width_value && height_value
      raise GameRoomGame::Error, "Invalid shape bounds."
    end

    color = data["color"].to_s
    color = color.match?(/\A#[0-9a-fA-F]{6}\z/) ? color : "#18181b"

    normalized = {
      id: id,
      type: "shape",
      shape: shape,
      bounds: {
        x: x.clamp(0.0, 1.0),
        y: y.clamp(0.0, 1.0),
        width: width_value.clamp(0.0, 1.0),
        height: height_value.clamp(0.0, 1.0)
      },
      color: color,
      width: data["width"].to_f.clamp(1.0, 30.0),
      fill: (data["fill"].to_s.match?(/\A#[0-9a-fA-F]{6}\z/) ? data["fill"].to_s : nil)
    }

    # Preserve concrete geometry generated by GameCanvas.
    shape_points =
      Array(data["points"])
        .first(5000)
        .filter_map do |point|
          next unless point.is_a?(Array) && point.length == 2

          px = Float(point[0]) rescue nil
          py = Float(point[1]) rescue nil

          next unless px && py

          [
            px.clamp(0.0, 1.0),
            py.clamp(0.0, 1.0)
          ]
        end

    normalized[:points] =
      shape_points if shape_points.length >= 2

    %w[start end].each do |key|
      next unless data[key].is_a?(Array) && data[key].length == 2
      sx = Float(data[key][0]) rescue nil
      sy = Float(data[key][1]) rescue nil
      normalized[key] = [sx.clamp(0.0, 1.0), sy.clamp(0.0, 1.0)] if sx && sy
    end

    return normalized
  elsif type == "fill"
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

  normalized = {
    id: id,
    type: type,
    points: points,
    color: color,
    width: width,
    pen: !!data["pen"],
    closed: !!data["closed"],
    fill: (
      data["fill"].to_s.match?(/\A#[0-9a-fA-F]{6}\z/) ?
        data["fill"].to_s :
        nil
    )
  }

  path_mode = data["pathMode"].to_s
  normalized[:pathMode] = path_mode if %w[linear smooth].include?(path_mode)
  normalized
end
end
