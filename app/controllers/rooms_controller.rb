class RoomsController < ApplicationController
  def new
    categories = Category.active.order(:position, :name)

    render inertia: "Rooms/New",
          props: {
            categories: categories.map do |category|
              {
                id: category.id,
                name: category.name,
                slug: category.slug,
                description: category.description
              }
            end
          }
  end
  def create
    @game_room = nil
    @player = nil

    category = Category.active.find(game_room_params[:category_id])

    GameRoom.transaction do
      @game_room = GameRoom.create!(
        code: generate_room_code,
        status: "waiting",
        current_round: 0,
        total_rounds: game_room_params[:total_rounds],
        round_duration: game_room_params[:round_duration]
      )

      @game_room.games.create!(
        number: 1,
        mode: @game_room.mode,
        status: "waiting",
        current_round: 0,
        total_rounds: @game_room.total_rounds,
        round_duration: @game_room.round_duration,
        category: category,
        difficulty: game_room_params[:difficulty]
      )

      @player = @game_room.players.create!(
        name: player_params[:name],
        position: 0,
        score: 0,
        connected: true
      )

      @player_token = @player.generate_player_token!
    end

    redirect_to room_path(
      @game_room.code,
      player_token: @player_token
    )
  rescue ActiveRecord::RecordInvalid => e
    errors =
      if e.record.respond_to?(:errors)
        e.record.errors.to_hash
      else
        {}
      end

    render inertia: "Rooms/New",
          props: {
            errors: errors,
            values: {
              name: player_params[:name],
              total_rounds: game_room_params[:total_rounds],
              round_duration: game_room_params[:round_duration],
              category_id: game_room_params[:category_id]
            },
            categories: Category.active.order(:position, :name).map do |category|
              {
                id: category.id,
                name: category.name,
                slug: category.slug,
                description: category.description
              }
            end
          },
          status: :unprocessable_entity
          rescue ActiveRecord::RecordNotFound
            render inertia: "Rooms/New",
                  props: {
                    errors: {
                      category_id: ["Please select a valid category."]
                    },
                    values: {
                      name: player_params[:name],
                      total_rounds: game_room_params[:total_rounds],
                      round_duration: game_room_params[:round_duration],
                      category_id: game_room_params[:category_id]
                    },
                    categories: Category.active.order(:position, :name).map do |category|
                      {
                        id: category.id,
                        name: category.name,
                        slug: category.slug,
                        description: category.description
                      }
                    end
                  },
                  status: :unprocessable_entity
  end

  def show
    @game_room = GameRoom.includes(:players).find_by!(
      code: params[:id].to_s.upcase
    )

    @player = Player.find_by_player_token(
      params[:player_token].to_s
    )

    @players = @game_room.players.order(:position)

    @current_game = @game_room.current_game

    @current_round =
      if @game_room.current_round.to_i > 0
        @game_room.rounds.find_by(
          game_number: @game_room.game_number,
          number: @game_room.current_round
        )
      end

    render inertia: "Rooms/Show", props: {
      game_room: {
        id: @game_room.id,
        code: @game_room.code,
        status: @game_room.status,
        current_round: @game_room.current_round,
        total_rounds: @game_room.total_rounds,
        round_duration: @game_room.round_duration,

        category: @current_game&.category && {
          id: @current_game.category.id,
          name: @current_game.category.name,
          slug: @current_game.category.slug
        },

        difficulty: @current_game&.difficulty
      },

      current_player: @player && {
        id: @player.id,
        name: @player.name,
        position: @player.position
      },

      player_token: params[:player_token],

      players: @players.map do |player|
        {
          id: player.id,
          name: player.name,
          score: player.score,
          position: player.position,
          connected: player.connected
        }
      end,

      current_round: @current_round && {
        id: @current_round.id,
        number: @current_round.number,
        drawer: {
          id: @current_round.drawer.id,
          name: @current_round.drawer.name
        },
        word: (
          @current_round.word if
            @player && @current_round.drawer_id == @player.id
        ),
        started_at: @current_round.started_at&.iso8601,
        duration: @game_room.round_duration,
        guesses: @current_round.guesses.includes(:player).order(:created_at).map do |guess|
          {
            id: guess.id,
            player: { id: guess.player.id, name: guess.player.name },
            text: guess.text,
            correct: guess.correct
          }
        end
      }
    }
end

  def join
  @game_room = GameRoom.find_by!(code: params[:id].to_s.upcase)

  player_token = params[:player_token].to_s
  existing_player = Player.find_by_player_token(player_token)

  Rails.logger.info(
    "[Join] room=#{@game_room.code} token_present=#{player_token.present?} " \
    "existing_player=#{existing_player&.id}"
  )

  # ------------------------------------------------------------
  # Returning player
  # ------------------------------------------------------------
  if existing_player && existing_player.game_room_id == @game_room.id
    # If this player explicitly left, their position will be outside
    # the active lobby positions. Put them at the end when they return.
    if existing_player.connected == false
      next_position =
        @game_room.players
          .where(connected: true)
          .maximum(:position).to_i + 1

      if next_position >= 8
        return render inertia: "Rooms/Join",
                      props: {
                        error: "This room is full."
                      },
                      status: :unprocessable_entity
      end

      existing_player.update!(
        position: next_position,
        connected: true,
        last_seen_at: Time.current
      )
    else
      # Normal reconnect: preserve their existing position.
      existing_player.update!(
        connected: true,
        last_seen_at: Time.current
      )
    end

    GameRoomBroadcaster.lobby_updated(@game_room)

    redirect_to room_path(
      @game_room.code,
      player_token: player_token
    )

    return
  end

  # ------------------------------------------------------------
  # New players can only join waiting rooms
  # ------------------------------------------------------------
  unless @game_room.status == "waiting"
    return render inertia: "Rooms/Join",
                  props: {
                    error: "This game has already started."
                  },
                  status: :unprocessable_entity
  end

  name = player_params[:name].to_s.strip

  # ------------------------------------------------------------
  # Prevent duplicate names among active players
  # ------------------------------------------------------------
  if @game_room.players.where(connected: true).exists?(name: name)
    return render inertia: "Rooms/Join",
                  props: {
                    error: "That name is already being used in this room."
                  },
                  status: :unprocessable_entity
  end

  # ------------------------------------------------------------
  # Maximum 8 active players
  # ------------------------------------------------------------
  next_position =
    @game_room.players
      .where(connected: true)
      .maximum(:position).to_i + 1

  if next_position >= 8
    return render inertia: "Rooms/Join",
                  props: {
                    error: "This room is full."
                  },
                  status: :unprocessable_entity
  end

  # ------------------------------------------------------------
  # Create new player
  # ------------------------------------------------------------
  @player = @game_room.players.create!(
    name: name,
    position: next_position,
    score: 0,
    connected: true
  )

  @player_token = @player.generate_player_token!

  GameRoomBroadcaster.lobby_updated(@game_room)

  redirect_to room_path(
    @game_room.code,
    player_token: @player_token
  )
rescue ActiveRecord::RecordInvalid => e
  render inertia: "Rooms/Join",
        props: {
          error: e.record.errors.full_messages.to_sentence
        },
        status: :unprocessable_entity
end

  def join_page
    render inertia: "Rooms/Join"
  end

  private

  def game_room_params
    params.require(:game_room).permit(
      :total_rounds,
      :round_duration,
      :category_id,
      :difficulty
    )
  end

  def player_params
    params.require(:player).permit(:name)
  end

  def generate_room_code
    loop do
      code = SecureRandom.alphanumeric(4).upcase
      break code unless GameRoom.exists?(code: code)
    end
  end
end
