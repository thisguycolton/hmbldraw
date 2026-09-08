class GameRoomGame
  class Error < StandardError
  end

  # --------------------------------------------------------------------------
  # Public API
  # --------------------------------------------------------------------------

  def self.start!(game_room, player)
    new(game_room, player).start!
  end

    def self.draw_stroke!(game_room, player, stroke)
    new(game_room, player).draw_stroke!(stroke)
  end

  def self.undo_stroke!(game_room, player, stroke_id)
    new(game_room, player).undo_stroke!(stroke_id)
  end

  def self.clear_canvas!(game_room, player)
    new(game_room, player).clear_canvas!
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
  # Start game
  # --------------------------------------------------------------------------

  def start!
    round = nil

    @game_room.with_lock do
      unless @player.game_room_id == @game_room.id
        raise Error, "You are not a player in this room."
      end

      unless @player.position == 0
        raise Error, "Only the host can start the game."
      end

      unless @game_room.status == "waiting"
        raise Error, "The game has already started."
      end

      players = @game_room.players.order(:position)

      if players.length < 2
        raise Error, "At least 2 players are required to start."
      end

      round = create_next_round!
    end

    # --------------------------------------------------------------
    # Tell everyone the game has started.
    # --------------------------------------------------------------

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

    word = word.to_s.strip.downcase

    unless round.word_options.include?(word)
      raise Error, "That word is not one of the available choices."
    end

    round.update!(
      word: word
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
    round = nil

    @game_room.with_lock do
      unless @player.game_room_id == @game_room.id
        raise Error, "You are not a player in this room."
      end

      unless @player.position == 0
        raise Error, "Only the host can start the game again."
      end

      unless @game_room.status == "finished"
        raise Error, "The game is not finished."
      end

      # Reset scores.
      @game_room.players.update_all(score: 0)

      # Start a new game using the same rules.
      @game_room.update!(
        game_number: @game_room.game_number + 1,
        current_round: 0
      )

      @game_room.reload

      round = create_next_round!
    end

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

  def end_round!(round, winner: nil)
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

      unless winner || Time.current >= deadline
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

      if last_round
        @game_room.update!(
          status: "finished"
        )

        game_finished = true
      else
        # --------------------------------------------------------------------
        # Create the next round in "starting" state.
        #
        # Players must become ready before it becomes "drawing".
        # --------------------------------------------------------------------

        next_round = create_next_round!
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

  def create_next_round!
    players =
      @game_room
        .players
        .where(connected: true)
        .order(:position)

    if players.length < 2
      raise Error, "At least 2 connected players are required."
    end

    round_number =
      @game_room.current_round + 1

    if round_number > @game_room.total_rounds
      raise Error, "There are no more rounds to play."
    end

    drawer_index =
      (round_number - 1) % players.length

    drawer =
      players[drawer_index]

    word_options =
      Word
        .order(Arel.sql("RANDOM()"))
        .limit(3)
        .to_a

    if word_options.length < 3
      raise Error, "Not enough words available."
    end


      round = @game_room.rounds.create!(
        number: round_number,
        game_number: @game_room.game_number,
        drawer: drawer,
        word: nil,
        word_options: word_options.map(&:text),
        strokes: [],
        status: "starting"
      )

    @game_room.update!(
      status: "starting_round",
      current_round: round_number
    )

    round
  end
  # --------------------------------------------------------------------------
  # Current round
  # --------------------------------------------------------------------------


    # --------------------------------------------------------------------------
  # Drawing
  # --------------------------------------------------------------------------

  def draw_stroke!(stroke)
    round = nil

    @game_room.with_lock do
      round = current_round!

      unless round.drawer_id == @player.id
        raise Error, "Only the drawer can draw."
      end

      stroke = normalize_stroke(stroke)

      if stroke["id"].blank?
        raise Error, "Invalid stroke ID."
      end

      if stroke["points"].empty?
        raise Error, "Invalid stroke points."
      end

      strokes = Array(round.strokes)

      # ------------------------------------------------------------
      # Idempotency:
      # If the client retries the same completed stroke, don't
      # duplicate it in the drawing.
      # ------------------------------------------------------------

      unless strokes.any? { |existing| existing["id"] == stroke["id"] }
        strokes << stroke
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

      strokes =
        Array(round.strokes).reject do |stroke|
          stroke["id"] == stroke_id.to_s
        end

      round.update!(strokes: strokes)
    end

    round
  end

  def clear_canvas!
    round = nil

    @game_room.with_lock do
      round = current_round!

      unless round.drawer_id == @player.id
        raise Error, "Only the drawer can clear the canvas."
      end

      round.update!(strokes: [])
    end

    round
  end

  private

  def normalize_stroke(stroke)
    stroke = stroke.to_h.stringify_keys

    {
      "id" => stroke["id"].to_s,
      "points" => Array(stroke["points"]).map do |point|
        Array(point).map(&:to_f)
      end,
      "color" => stroke["color"].to_s,
      "width" => stroke["width"].to_f
    }
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
