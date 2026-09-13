class GameRoomGame
  class Error < StandardError
  end

  # --------------------------------------------------------------------------
  # Public API
  # --------------------------------------------------------------------------

  def self.start!(game_room, player)
    new(game_room, player).start!
  end

  def self.leave_room!(game_room, player)
    new(game_room, player).leave_room!
  end

  def self.leave_room!(game_room, player)
    new(game_room, player).leave_room!
  end

  def self.draw_stroke!(game_room, player, stroke)
    new(game_room, player).draw_stroke!(stroke)
  end

  def self.update_object!(game_room, player, operation)
    new(game_room, player).update_object!(operation)
  end

  def self.reorder_layers!(game_room, player, operation)
    new(game_room, player).reorder_layers!(operation)
  end

  def self.delete_object!(game_room, player, operation)
    new(game_room, player).delete_object!(operation)
  end

  def self.undo_stroke!(game_room, player, stroke_id)
    new(game_room, player).undo_stroke!(stroke_id)
  end

  def self.clear_canvas!(game_room, player, operation)
    new(game_room, player).clear_canvas!(operation)
  end

  def self.play_again!(game_room, player)
    new(game_room, player).play_again!
  end

  def self.choose_word!(game_room, player, word)
    new(game_room, player).choose_word!(word)
  end

  def self.set_ready!(game_room, player)
    new(game_room, player).set_ready!
  end

  def self.submit_guess!(game_room, player, text)
    new(game_room, player).submit_guess!(text)
  end

  def self.end_round!(game_room, round, winner: nil)
    new(game_room, nil).end_round!(round, winner: winner)
  end

  def initialize(game_room, player)
    @game_room = game_room
    @player = player
  end

# --------------------------------------------------------------------------
# Leave room
# --------------------------------------------------------------------------

def self.leave_room!(game_room, player)
  new(game_room, player).leave_room!
end

def leave_room!
  @game_room.with_lock do
    @game_room.reload
    @player = @game_room.players.find(@player.id)

    raise Error, "You are not in this room." unless @player
    raise Error, "You cannot leave once the game has started." unless @game_room.status == "waiting"

    # Move the departing player out of the active position range before
    # disconnecting them. This is important because Player validates the
    # uniqueness of [game_room_id, position].
    inactive_position = @game_room.players.maximum(:position).to_i + 1

    @player.update_columns(
      connected: false,
      position: inactive_position,
      last_seen_at: Time.current
    )

    # Re-number the remaining active players.
    active_players = @game_room.players
      .where(connected: true)
      .order(:position, :id)
      .to_a

    # Temporarily move active players away from 0..N to avoid collisions
    # with the unique (game_room_id, position) constraint.
    active_players.each_with_index do |active_player, index|
      active_player.update_columns(position: index + 1000)
    end

    # Now assign the real positions.
    active_players.each_with_index do |active_player, index|
      active_player.update_columns(position: index)
    end

    GameRoomBroadcaster.lobby_updated(@game_room)
  end

  true
end
  # --------------------------------------------------------------------------
  # Start game
  # --------------------------------------------------------------------------

  def start!
  @game_room.with_lock do
    @game_room.reload
    @player = @game_room.players.find(@player.id)

    raise Error, "Game has already started" unless @game_room.status == "waiting"
    raise Error, "Only the host can start the game" unless @player.position.zero?
    raise Error, "At least 2 players are required" if @game_room.players.count < 2

    game = @game_room.current_game

    raise Error, "No game is available to start" unless game
    raise Error, "Game has already started" unless game.status == "waiting"

    game.update!(
      status: "active",
      current_round: 0,
      started_at: Time.current
    )

    round = create_next_round!(game)

    @game_room.update!(
      status: "starting_round",
      current_round: round.number
    )

    GameRoomBroadcaster.game_started(
      @game_room,
      round
    )

    GameRoomBroadcaster.round_starting(
      @game_room,
      round
    )

    GameRoomBroadcaster.word_options(
      round.drawer,
      round
    )

    round
  end
end

  # --------------------------------------------------------------------------
  # Choose word
  # --------------------------------------------------------------------------

def choose_word!(word)
  @game_room.with_lock do
    @game_room.reload

    unless @game_room.status == "starting_round"
      raise Error, "The game is not currently choosing a word."
    end

    round =
      @game_room.rounds.find_by(
        game_number: @game_room.game_number,
        number: @game_room.current_round
      )

    raise Error, "No active round." unless round

    unless round.status == "starting"
      raise Error, "The round is not currently starting."
    end

    unless round.drawer_id == @player.id
      raise Error, "Only the drawer can choose the word."
    end

    submitted_word = word.to_s.strip

    selected_word =
      round.word_options.find do |option|
        option.to_s.strip.casecmp?(submitted_word)
      end

    unless selected_word
      raise Error, "That word is not one of the available choices."
    end

    round.update!(
      word: selected_word
    )
  end
end

  # --------------------------------------------------------------------------
  # Ready
  # --------------------------------------------------------------------------

  def set_ready!
    round = nil
    all_ready = false

    @game_room.with_lock do
      unless @player.game_room_id == @game_room.id
        raise Error, "You are not a player in this room."
      end

      unless @game_room.status == "starting_round"
        raise Error, "The game is not waiting for players to get ready."
      end

      round =
        @game_room.rounds.find_by(
          game_number: @game_room.game_number,
          number: @game_room.current_round
        )

      raise Error, "No active round." unless round

      unless round.status == "starting"
        raise Error, "This round is not waiting for players to get ready."
      end

      # The drawer MUST choose a word before becoming ready.
      if round.drawer_id == @player.id && round.word.blank?
        raise Error, "Choose a word before readying up."
      end

      # Don't create duplicate readiness records.
      RoundReady.find_or_create_by!(
        round: round,
        player: @player
      ) do |ready|
        ready.ready_at = Time.current
      end

      connected_player_ids =
        @game_room
          .players
          .where(connected: true)
          .order(:position)
          .pluck(:id)

      ready_player_ids =
        round
          .round_readies
          .where(player_id: connected_player_ids)
          .pluck(:player_id)

      all_ready =
        connected_player_ids.sort == ready_player_ids.sort

      if all_ready
        round.update!(
          status: "drawing",
          started_at: Time.current
        )

        @game_room.update!(
          status: "drawing"
        )
      end
    end

    # --------------------------------------------------------------
    # Tell everyone this player is ready.
    # --------------------------------------------------------------

    GameRoomBroadcaster.player_ready(
      @game_room,
      round,
      @player
    )

    # --------------------------------------------------------------
    # Last player ready → start the round.
    # --------------------------------------------------------------

    if all_ready
      GameRoomBroadcaster.round_started(
        @game_room,
        round
      )

      RoundTimeoutJob
        .set(
          wait_until:
            round.started_at +
            @game_room.round_duration.seconds
        )
        .perform_later(round.id)
    end

    round
  end

  # --------------------------------------------------------------------------
  # Play Again
  # --------------------------------------------------------------------------

  def play_again!
  @game_room.with_lock do
    @game_room.reload
    @player = @game_room.players.find(@player.id)

    raise Error, "Only the host can start a new game" unless @player.position.zero?
    raise Error, "Game is not finished" unless @game_room.status == "finished"

    previous_game = @game_room.current_game

    next_game_number =
      if previous_game
        previous_game.number + 1
      else
        @game_room.game_number + 1
      end

    game = @game_room.games.create!(
      number: next_game_number,
      mode: @game_room.mode,
      status: "waiting",
      current_round: 0,
      total_rounds: @game_room.total_rounds,
      round_duration: @game_room.round_duration,
      category: previous_game&.category,
      difficulty: previous_game&.difficulty
    )

    @game_room.players.update_all(score: 0)

    @game_room.update!(
      game_number: next_game_number,
      current_round: 0,
      status: "waiting",
      started_at: nil,
      finished_at: nil
    )

    GameRoomBroadcaster.lobby_updated(@game_room)

    game
  end
end

  # --------------------------------------------------------------------------
  # Submit guess
  # --------------------------------------------------------------------------

  def submit_guess!(text)
    text = text.to_s.strip.downcase

    raise Error, "Please enter a guess." if text.blank?
    raise Error, "Your guess is too long." if text.length > 100

    round = nil
    guess = nil
    correct = false

    @game_room.with_lock do
      round = current_round!

      unless @game_room.status == "drawing" &&
             round.status == "drawing"
        raise Error, "The round is not currently accepting guesses."
      end

      if round.drawer_id == @player.id
        raise Error, "The drawer cannot submit a guess."
      end

      deadline =
        round.started_at +
        @game_room.round_duration.seconds

      if Time.current >= deadline
        raise Error, "Time is up."
      end

      correct =
        text == round.word.to_s.strip.downcase

      guess =
        round.guesses.create!(
          player: @player,
          text: text,
          correct: correct
        )

      if correct
        round.update!(
          winner: @player
        )
      end
    end

    if correct
      end_round!(
        round,
        winner: @player
      )

      GameRoomBroadcaster.correct_guess(
        @game_room,
        round,
        guess
      )
    else
      GameRoomBroadcaster.guess_submitted(
        @game_room,
        guess
      )
    end

    guess
  end



    # --------------------------------------------------------------------------
  # End round
  # --------------------------------------------------------------------------

  def end_round!(round, winner: nil, reason: nil)
    ended_round = nil
    next_round = nil
    scores = nil
    game_finished = false

    @game_room.with_lock do
      @game_room.reload
      round.reload

      # ----------------------------------------------------------------------
      # Validate that this round belongs to this room.
      # ----------------------------------------------------------------------

      unless round.game_room_id == @game_room.id
        raise Error, "Round does not belong to this game."
      end

      # ----------------------------------------------------------------------
      # Ignore stale timeout jobs or duplicate calls.
      #
      # A timeout job contains the specific round ID that it was created for.
      # Do NOT use current_round! here because the room may have already moved
      # on to another game/round.
      # ----------------------------------------------------------------------

      unless round.game_number == @game_room.game_number &&
             round.number == @game_room.current_round
        Rails.logger.info(
          "[GameRoomGame] Ignoring stale end_round! " \
          "round=#{round.id} " \
          "round_game=#{round.game_number} " \
          "round_number=#{round.number} " \
          "current_game=#{@game_room.game_number} " \
          "current_round=#{@game_room.current_round}"
        )

        return round
      end

      # Already ended. Nothing to do.
      return round if round.status == "ended"

      # ----------------------------------------------------------------------
      # Validate current state.
      # ----------------------------------------------------------------------

      unless @game_room.status == "drawing"
        raise Error, "The game is not currently drawing."
      end

      unless round.status == "drawing"
        raise Error, "The round is not currently drawing."
      end

      # ----------------------------------------------------------------------
      # Winner
      # ----------------------------------------------------------------------

      if winner
        unless winner.game_room_id == @game_room.id
          raise Error, "Winner does not belong to this game."
        end

        round.update!(
          winner: winner
        )
      end

      # ----------------------------------------------------------------------
      # Deadline
      # ----------------------------------------------------------------------

      deadline =
        round.started_at +
        @game_room.round_duration.seconds

      forced_end =
        reason == :drawer_disconnected

      unless winner || forced_end || Time.current >= deadline
        raise Error, "The round has not ended yet."
      end

      # ----------------------------------------------------------------------
      # Score
      # ----------------------------------------------------------------------

      if round.winner
        winner_player = round.winner
        drawer = round.drawer

        elapsed =
          Time.current -
          round.started_at

        duration =
          @game_room.round_duration.to_f

        remaining =
          [duration - elapsed, 0].max

        time_bonus =
          ((remaining / duration) * 100).round

        guesser_points =
          100 + time_bonus

        drawer_points = 50

        winner_player.increment!(
          :score,
          guesser_points
        )

        drawer.increment!(
          :score,
          drawer_points
        )
      end

      # ----------------------------------------------------------------------
      # End current round
      # ----------------------------------------------------------------------

      round.update!(
        status: "ended",
        ended_at: Time.current
      )

      last_round =
        round.number >= @game_room.total_rounds

      connected_player_count =
        @game_room.players.where(connected: true).count

      cannot_continue =
        connected_player_count < 2

      if last_round || cannot_continue
        game = @game_room.current_game

        game.update!(
          status: "finished",
          finished_at: Time.current
        )

        @game_room.update!(
          status: "finished",
          finished_at: Time.current
        )

        game_finished = true
      else
        # --------------------------------------------------------------------
        # Create the next round in "starting" state.
        #
        # Players must become ready before it becomes "drawing".
        # --------------------------------------------------------------------

        game = @game_room.current_game

        next_round = create_next_round!(game)
      end


      # ----------------------------------------------------------------------
      # Reload ended round for broadcast
      # ----------------------------------------------------------------------

      ended_round =
        @game_room
          .rounds
          .includes(
            :drawer,
            :winner,
            guesses: :player
          )
          .find(round.id)

      # ----------------------------------------------------------------------
      # Scores
      # ----------------------------------------------------------------------

      scores =
        @game_room
          .players
          .order(:position)
          .map do |player|
            {
              id: player.id,
              name: player.name,
              score: player.score,
              position: player.position
            }
          end
    end

    # ------------------------------------------------------------------------
    # Broadcast completed round
    # ------------------------------------------------------------------------

    GameRoomBroadcaster.score_updated(
      @game_room,
      scores
    )

    GameRoomBroadcaster.round_ended(
      @game_room,
      ended_round,
      scores: scores
    )

    # ------------------------------------------------------------------------
    # Final game
    # ------------------------------------------------------------------------

    if game_finished
      GameRoomBroadcaster.game_finished(
        @game_room,
        scores
      )

      return ended_round
    end

    # ------------------------------------------------------------------------
    # Next round is waiting for Ready.
    # ------------------------------------------------------------------------

    GameRoomBroadcaster.round_starting(
      @game_room,
      next_round
    )

    GameRoomBroadcaster.word_options(
      next_round.drawer,
      next_round
    )

    ended_round
  end

  # --------------------------------------------------------------------------
  # Create next round
  # --------------------------------------------------------------------------

  def create_next_round!(game)
  players =
    @game_room
      .players
      .where(connected: true)
      .order(:position)

  raise Error, "At least 2 connected players are required" if players.count < 2

  next_round_number = game.current_round + 1

  if game.total_rounds.present? &&
     next_round_number > game.total_rounds
    raise Error, "No more rounds remain"
  end

  drawer =
    players[
      (next_round_number - 1) % players.length
    ]

  words =
    Word.random_for_category(
      game.category,
      3
    )

  raise Error, "Not enough words available" if words.length < 3

  round =
    @game_room.rounds.create!(
      number: next_round_number,
      game_number: game.number,
      drawer: drawer,
      word: nil,
      word_options: words.map(&:text),
      strokes: [],
      status: "starting"
    )

  game.update!(
    current_round: next_round_number
  )

  @game_room.update!(
    current_round: next_round_number,
    status: "starting_round"
  )

  round
end

    # --------------------------------------------------------------------------
  # Drawing
  # --------------------------------------------------------------------------
# ------------------------------------------------------------------------------
# Drawing
# ------------------------------------------------------------------------------

def draw_stroke!(stroke)
  round = nil

  @game_room.with_lock do
    round = current_round!

    unless round.drawer_id == @player.id
      raise Error, "Only the drawer can draw."
    end

    stroke = normalize_stroke(stroke)

    Rails.logger.debug(
      "[GameRoomGame] normalized stroke id=#{stroke["id"]} "       "type=#{stroke["type"]} pen=#{stroke["pen"]} "       "closed=#{stroke["closed"]} fill=#{stroke["fill"].inspect}"
    )

    if stroke["id"].blank?
      raise Error, "Invalid drawing operation ID."
    end

    strokes = Array(round.strokes)

    if stroke["type"] == "erase"
      active_ids = active_drawable_ids(strokes)
      erased_ids = stroke["changes"].map { |change| change["objectId"] }

      unless erased_ids.all? { |object_id| active_ids.include?(object_id) }
        raise Error, "Drawing object no longer exists."
      end

      after_ids = stroke["changes"].flat_map do |change|
        change["after"].map { |object| object["id"].to_s }
      end

      if after_ids.any?(&:blank?) || after_ids.uniq.length != after_ids.length
        raise Error, "Invalid erased object geometry."
      end

      if (after_ids & (active_ids - erased_ids)).any?
        raise Error, "Invalid erased object geometry."
      end
    end

    # --------------------------------------------------------------------------
    # Idempotency
    # --------------------------------------------------------------------------

    unless strokes.any? { |existing| existing["id"].to_s == stroke["id"].to_s }
      strokes << stroke
      round.update!(strokes: strokes)
    end
  end

  round
end

def reorder_layers!(operation)
  round = nil

  @game_room.with_lock do
    round = current_round!

    unless round.drawer_id == @player.id
      raise Error, "Only the drawer can reorder layers."
    end

    operation = normalize_layer_reorder(operation)
    strokes = Array(round.strokes)

    drawable_ids = active_drawable_ids(strokes)

    requested = operation["order"].map(&:to_s)
    order = requested.select { |id| drawable_ids.include?(id) }
    order += drawable_ids.reject { |id| order.include?(id) }

    normalized = operation.merge("order" => order)

    unless strokes.any? { |existing| existing["id"].to_s == normalized["id"].to_s }
      strokes << normalized
      round.update!(strokes: strokes)
    end
  end

  round
end

def update_object!(operation)

  round = nil

  @game_room.with_lock do
    round = current_round!

    unless round.drawer_id == @player.id
      raise Error, "Only the drawer can edit the drawing."
    end

    operation = normalize_object_update(operation)
    strokes = Array(round.strokes)

    object_exists = active_drawable_ids(strokes).include?(operation["objectId"])

    unless object_exists
      raise Error, "Drawing object no longer exists."
    end

    unless strokes.any? { |existing| existing["id"].to_s == operation["id"] }
      strokes << operation
      round.update!(strokes: strokes)
    end
  end

  round
end

def delete_object!(operation)
  round = nil

  @game_room.with_lock do
    round = current_round!

    unless round.drawer_id == @player.id
      raise Error, "Only the drawer can edit the drawing."
    end

    operation = normalize_object_delete(operation)
    strokes = Array(round.strokes)

    object_exists = active_drawable_ids(strokes).include?(operation["objectId"])

    unless object_exists
      raise Error, "Drawing object no longer exists."
    end

    unless strokes.any? { |existing| existing["id"].to_s == operation["id"] }
      strokes << operation
      round.update!(strokes: strokes)
    end
  end

  round
end

def undo_stroke!(stroke_id)
  round = nil

  @game_room.with_lock do
    round = current_round!

    unless round.drawer_id == @player.id
      raise Error, "Only the drawer can undo strokes."
    end

    strokes = Array(round.strokes)
    target_id = stroke_id.to_s

    undoable_types = %w[stroke shape fill eraser erase object_update object_delete layer_reorder canvas_clear]
    latest_action = strokes.reverse.find do |stroke|
      undoable_types.include?(stroke["type"].to_s)
    end

    unless latest_action && latest_action["id"].to_s == target_id
      raise Error, "Nothing to undo."
    end

    strokes =
      strokes.reject do |stroke|
        stroke["id"].to_s == target_id
      end

    round.update!(strokes: strokes)
  end

  round
end

def clear_canvas!(operation)
  round = nil

  @game_room.with_lock do
    round = current_round!

    unless round.drawer_id == @player.id
      raise Error, "Only the drawer can clear the canvas."
    end

    operation = normalize_canvas_clear(operation)
    strokes = Array(round.strokes)

    unless strokes.any? { |existing| existing["id"].to_s == operation["id"] }
      if active_drawable_ids(strokes).empty?
        raise Error, "Nothing to clear."
      end

      strokes << operation
      round.update!(strokes: strokes)
    end
  end

  round
end

private

def normalize_canvas_clear(operation)
  operation = operation.to_h.stringify_keys
  id = operation["id"].to_s.first(100)

  raise Error, "Invalid clear operation ID." if id.blank?

  {
    "id" => id,
    "type" => "canvas_clear"
  }
end

def normalize_layer_reorder(operation)
  operation = operation.to_h.stringify_keys
  id = operation["id"].to_s.first(100)

  order =
    Array(operation["order"])
      .first(500)
      .map { |value| value.to_s.first(100) }
      .select(&:present?)
      .uniq

  raise Error, "Invalid layer operation ID." if id.blank?
  raise Error, "Invalid layer order." if order.empty?

  {
    "id" => id,
    "type" => "layer_reorder",
    "order" => order
  }
end

def normalize_object_update(operation)

  operation = operation.to_h.stringify_keys
  id = operation["id"].to_s.first(100)
  object_id = operation["objectId"].to_s.first(100)

  raise Error, "Invalid drawing operation ID." if id.blank?
  raise Error, "Invalid drawing object ID." if object_id.blank?

  changes = operation["changes"]
  changes = changes.to_h.stringify_keys if changes.is_a?(Hash)

  unless changes.is_a?(Hash)
    raise Error, "Invalid drawing update."
  end

  allowed = %w[points bounds color width shape start end pen closed type fill hidden pathMode]
  changes = changes.slice(*allowed)

  normalized = {
    "id" => id,
    "type" => "object_update",
    "objectId" => object_id,
    "changes" => changes
  }

  if changes.key?("points")
    normalized["changes"]["points"] =
      Array(changes["points"]).first(5000).filter_map do |point|
        next unless point.is_a?(Array) && point.length == 2
        x = Float(point[0]) rescue nil
        y = Float(point[1]) rescue nil
        next unless x && y
        [x.clamp(0.0, 1.0), y.clamp(0.0, 1.0)]
      end
  end

  if changes.key?("bounds") && changes["bounds"].is_a?(Hash)
    bounds = changes["bounds"].stringify_keys
    x = Float(bounds["x"]) rescue 0.0
    y = Float(bounds["y"]) rescue 0.0
    width_value = Float(bounds["width"]) rescue 0.0
    height_value = Float(bounds["height"]) rescue 0.0

    normalized["changes"]["bounds"] = {
      "x" => x.clamp(0.0, 1.0),
      "y" => y.clamp(0.0, 1.0),
      "width" => width_value.clamp(0.0, 1.0),
      "height" => height_value.clamp(0.0, 1.0)
    }
  end

  if changes.key?("start") || changes.key?("end")
    %w[start end].each do |key|
      next unless changes[key].is_a?(Array) && changes[key].length == 2
      x = Float(changes[key][0]) rescue nil
      y = Float(changes[key][1]) rescue nil
      normalized["changes"][key] =
        x && y ? [x.clamp(0.0, 1.0), y.clamp(0.0, 1.0)] : nil
    end
  end

  if changes.key?("color")
    color = changes["color"].to_s
    normalized["changes"]["color"] =
      color.match?(/\A#[0-9a-fA-F]{6}\z/) ? color : "#18181b"
  end

  if changes.key?("width")
    normalized["changes"]["width"] =
      changes["width"].to_f.clamp(1.0, 30.0)
  end

  if normalized["changes"].key?("type") &&
     !%w[stroke shape].include?(normalized["changes"]["type"].to_s)
    raise Error, "Invalid drawing update type."
  end

  if normalized["changes"].key?("pen")
    normalized["changes"]["pen"] = !!normalized["changes"]["pen"]
  end

  if normalized["changes"].key?("closed")
    normalized["changes"]["closed"] = !!normalized["changes"]["closed"]
  end

  if changes.key?("fill")
    fill = changes["fill"].to_s
    normalized["changes"]["fill"] =
      if fill.blank?
        nil
      elsif fill.match?(%r{\A#[0-9a-fA-F]{6}\z})
        fill
      else
        "#18181b"
      end
  end

  if normalized["changes"].key?("shape") &&
     !%w[line circle square triangle].include?(normalized["changes"]["shape"].to_s)
    raise Error, "Invalid drawing shape."
  end

  if normalized["changes"].key?("pathMode")
    path_mode = normalized["changes"]["pathMode"].to_s
    unless %w[linear smooth].include?(path_mode)
      raise Error, "Invalid drawing path mode."
    end
    normalized["changes"]["pathMode"] = path_mode
  end

  normalized
end

def normalize_object_delete(operation)
  operation = operation.to_h.stringify_keys
  id = operation["id"].to_s.first(100)
  object_id = operation["objectId"].to_s.first(100)

  raise Error, "Invalid drawing operation ID." if id.blank?
  raise Error, "Invalid drawing object ID." if object_id.blank?

  {
    "id" => id,
    "type" => "object_delete",
    "objectId" => object_id
  }
end

def normalize_stroke(stroke)
  stroke =
    stroke
      .to_h
      .stringify_keys

  type =
    stroke["type"].to_s

  type = "stroke" if type.blank?

  unless %w[stroke eraser fill shape erase].include?(type)
    raise Error, "Invalid drawing operation."
  end

  id =
    stroke["id"]
      .to_s
      .first(100)

  raise Error, "Invalid drawing operation ID." if id.blank?

  # --------------------------------------------------------------------------
  # Vector shape
  # --------------------------------------------------------------------------

  if type == "erase"
    changes = Array(stroke["changes"]).first(500).map do |change|
      change = change.to_h.stringify_keys
      object_id = change["objectId"].to_s.first(100)
      raise Error, "Invalid erased object ID." if object_id.blank?

      after = Array(change["after"]).first(500).map do |object|
        normalized_object = normalize_stroke(object)
        unless %w[stroke shape].include?(normalized_object["type"])
          raise Error, "Invalid erased object geometry."
        end
        normalized_object
      end

      {
        "objectId" => object_id,
        "after" => after
      }
    end

    raise Error, "Invalid erase operation." if changes.empty?

    object_ids = changes.map { |change| change["objectId"] }
    raise Error, "Invalid erase operation." unless object_ids.uniq.length == object_ids.length

    return {
      "id" => id,
      "type" => "erase",
      "changes" => changes
    }
  end

  if type == "shape"
    shape = stroke["shape"].to_s

    unless %w[line circle square triangle].include?(shape)
      raise Error, "Invalid shape."
    end

    color = stroke["color"].to_s
    color = color.match?(/\A#[0-9a-fA-F]{6}\z/) ? color : "#18181b"

    width = stroke["width"].to_f.clamp(1.0, 30.0)
    bounds = stroke["bounds"].to_h.stringify_keys

    x = Float(bounds["x"]) rescue nil
    y = Float(bounds["y"]) rescue nil
    width_value = Float(bounds["width"]) rescue nil
    height_value = Float(bounds["height"]) rescue nil

    unless x && y && width_value && height_value
      raise Error, "Invalid shape bounds."
    end

    normalized = {
      "id" => id,
      "type" => "shape",
      "shape" => shape,
      "color" => color,
      "width" => width,
      "fill" => (
        stroke["fill"].to_s.match?(/\A#[0-9a-fA-F]{6}\z/) ?
          stroke["fill"].to_s :
          nil
      ),
      "bounds" => {
        "x" => x.clamp(0.0, 1.0),
        "y" => y.clamp(0.0, 1.0),
        "width" => width_value.clamp(0.0, 1.0),
        "height" => height_value.clamp(0.0, 1.0)
      }
    }

    %w[start end].each do |key|
      next unless stroke[key].is_a?(Array) && stroke[key].length == 2
      sx = Float(stroke[key][0]) rescue nil
      sy = Float(stroke[key][1]) rescue nil
      normalized[key] = [sx.clamp(0.0, 1.0), sy.clamp(0.0, 1.0)] if sx && sy
    end

    # Preserve concrete points when the client supplies them. This keeps
    # shapes compatible with generic stroke validation and replay.
    shape_points =
      Array(stroke["points"]).first(5000).filter_map do |point|
        next unless point.is_a?(Array) && point.length == 2
        px = Float(point[0]) rescue nil
        py = Float(point[1]) rescue nil
        next unless px && py
        [px.clamp(0.0, 1.0), py.clamp(0.0, 1.0)]
      end

    if shape_points.length >= 2
      normalized["points"] = shape_points
    else
      # Derive simple concrete geometry from the canonical bounds.
      bx = normalized["bounds"]["x"]
      by = normalized["bounds"]["y"]
      bw = normalized["bounds"]["width"]
      bh = normalized["bounds"]["height"]

      normalized["points"] =
        case shape
        when "triangle"
          [
            [bx + bw / 2.0, by],
            [bx + bw, by + bh],
            [bx, by + bh],
            [bx + bw / 2.0, by]
          ]
        when "line"
          [
            [bx, by],
            [bx + bw, by + bh]
          ]
        when "circle"
          center_x = bx + bw / 2.0
          center_y = by + bh / 2.0
          radius_x = bw / 2.0
          radius_y = bh / 2.0

          (0..48).map do |index|
            angle = index.fdiv(48) * Math::PI * 2
            [
              center_x + Math.cos(angle) * radius_x,
              center_y + Math.sin(angle) * radius_y
            ]
          end
        else
          [
            [bx, by],
            [bx + bw, by],
            [bx + bw, by + bh],
            [bx, by + bh],
            [bx, by]
          ]
        end
    end

    return normalized
  elsif type == "fill"
    point =
      Array(stroke["point"])

    unless point.length == 2
      raise Error, "Invalid fill point."
    end

    x = Float(point[0]) rescue nil
    y = Float(point[1]) rescue nil

    unless x && y
      raise Error, "Invalid fill point."
    end

    color =
      stroke["color"].to_s

    color =
      if color.match?(/\A#[0-9a-fA-F]{6}\z/)
        color
      else
        "#18181b"
      end

    return {
      "id" => id,
      "type" => "fill",
      "point" => [
        x.clamp(0.0, 1.0),
        y.clamp(0.0, 1.0)
      ],
      "color" => color
    }
  end

  # --------------------------------------------------------------------------
  # Stroke / eraser
  # --------------------------------------------------------------------------

  points =
    Array(stroke["points"])
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

  raise Error, "Invalid stroke points." if points.empty?

  width =
    stroke["width"]
      .to_f
      .clamp(1.0, 30.0)

  color =
    stroke["color"].to_s

  color =
    if color.match?(/\A#[0-9a-fA-F]{6}\z/)
      color
    else
      "#18181b"
    end

  normalized = {
    "id" => id,
    "type" => type,
    "points" => points,
    "color" => color,
    "width" => width,
    "pen" => !!stroke["pen"],
    "closed" => !!stroke["closed"],
    "fill" => (
      stroke["fill"].to_s.match?(/\A#[0-9a-fA-F]{6}\z/) ?
        stroke["fill"].to_s :
        nil
    )
  }

  path_mode = stroke["pathMode"].to_s
  normalized["pathMode"] = path_mode if %w[linear smooth].include?(path_mode)
  normalized
end

def active_drawable_ids(strokes)
  ids = []

  Array(strokes).each do |operation|
    operation = operation.to_h.stringify_keys

    case operation["type"].to_s
    when "canvas_clear"
      ids.clear
    when "object_delete"
      ids.delete(operation["objectId"].to_s)
    when "erase"
      Array(operation["changes"]).each do |change|
        change = change.to_h.stringify_keys
        ids.delete(change["objectId"].to_s)
        Array(change["after"]).each do |object|
          object_id = object.to_h.stringify_keys["id"].to_s
          ids << object_id if object_id.present? && !ids.include?(object_id)
        end
      end
    when "stroke", "shape", "fill"
      operation_id = operation["id"].to_s
      ids << operation_id if operation_id.present? && !ids.include?(operation_id)
    end
  end

  ids
end

def current_round!
  @game_room.reload

  round =
    @game_room.rounds.find_by(
      game_number: @game_room.game_number,
      number: @game_room.current_round
    )

  raise GameRoomGame::Error,
        "No active round." unless round

  unless @game_room.status == "drawing" &&
         round.status == "drawing"
    raise GameRoomGame::Error,
          "The round is not currently drawing."
  end

  round
end
end
