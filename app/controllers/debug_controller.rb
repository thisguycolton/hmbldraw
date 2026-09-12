class DebugController < ApplicationController
  def drawing
    render inertia: "DrawingDebug"
  end
end
